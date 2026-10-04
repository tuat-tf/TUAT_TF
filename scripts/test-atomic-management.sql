-- Only synthetic profiles from the independent review seed. The runner starts
-- a transaction; every test fixture, vote, and countdown change rolls back.
CREATE FUNCTION pg_temp.fail_test_countdown() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = current_setting('test.block_countdown',true) AND NEW.is_countdown THEN
    RAISE EXCEPTION 'Synthetic second-write failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER atomic_review_countdown_failure BEFORE UPDATE ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_test_countdown();
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  owner_id uuid := current_setting('test.owner')::uuid;
  member_id uuid := current_setting('test.member')::uuid;
  viewer_id uuid := current_setting('test.viewer')::uuid;
  folder_id uuid := gen_random_uuid();
  missing_folder_id uuid := gen_random_uuid();
  v_article_id uuid := gen_random_uuid();
  missing_article_id uuid := gen_random_uuid();
  option_a uuid := gen_random_uuid();
  option_b uuid := gen_random_uuid();
  option_c uuid := gen_random_uuid();
  option_d uuid := gen_random_uuid();
  v_tweet_id uuid := gen_random_uuid();
  failed_tweet_id uuid := gen_random_uuid();
  v_quoted_id uuid := gen_random_uuid();
  tweet_payload jsonb;
  version_at timestamptz;
  payload jsonb := jsonb_build_object('title','Folder before','scope','shared','description','Before','status','published','edit_policy','specified','parent_id',null);
  article_payload jsonb := jsonb_build_object('title','Article before','body','Before','poll_multiple',false,'poll_anonymous',true,'poll_allow_options',false);
  response jsonb;
  actual text;
  c1 text := 'atomic-review-' || gen_random_uuid()::text;
  c2 text := 'atomic-review-' || gen_random_uuid()::text;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  IF NOT public.can_manage_system() THEN RAISE EXCEPTION 'Synthetic owner lacks expected system permission'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('save_note_folder','save_note_article','set_competition_countdown','lock_note_poll_change','save_tweet') AND p.prosecdef) THEN
    RAISE EXCEPTION 'Atomic writers must remain invokers';
  END IF;
  IF has_function_privilege('anon','public.save_note_folder(uuid,timestamptz,jsonb,uuid[])','EXECUTE') THEN RAISE EXCEPTION 'Anonymous RPC grant'; END IF;
  IF has_function_privilege('anon','public.save_tweet(uuid,jsonb,text[],uuid[],boolean,text)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous Tweet RPC grant'; END IF;

  response := public.save_note_folder(folder_id,NULL,payload,ARRAY[member_id]);
  version_at := (response->>'updated_at')::timestamptz;
  IF NOT EXISTS(SELECT 1 FROM public.note_editors WHERE note_id=folder_id AND user_id=member_id) THEN RAISE EXCEPTION 'Editor not inserted'; END IF;
  BEGIN
    PERFORM public.save_note_folder(folder_id,version_at,payload || '{"title":"Must roll back"}',ARRAY[gen_random_uuid()]);
    RAISE EXCEPTION 'Expected editor FK failure';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF (SELECT title FROM public.notes WHERE id=folder_id) <> 'Folder before'
    OR NOT EXISTS(SELECT 1 FROM public.note_editors WHERE note_id=folder_id AND user_id=member_id) THEN
    RAISE EXCEPTION 'Folder/editor replacement was partially saved';
  END IF;
  BEGIN
    PERFORM public.save_note_folder(missing_folder_id,NULL,payload,ARRAY[gen_random_uuid()]);
    RAISE EXCEPTION 'Expected new folder editor FK failure';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.notes WHERE id=missing_folder_id) THEN RAISE EXCEPTION 'Failed create left orphan folder'; END IF;
  BEGIN
    PERFORM public.save_note_folder(folder_id,'2000-01-01'::timestamptz,payload,ARRAY[member_id]);
    RAISE EXCEPTION 'Expected folder conflict';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  response := public.save_note_folder(folder_id,version_at,payload || '{"title":"Member title"}',ARRAY[member_id]);
  BEGIN
    PERFORM public.save_note_folder(folder_id,(response->>'updated_at')::timestamptz,
      payload || '{"title":"Must roll back","scope":"personal","edit_policy":"everyone"}',ARRAY[viewer_id]);
    RAISE EXCEPTION 'Expected non-owner management refusal';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT title FROM public.notes WHERE id=folder_id) <> 'Member title' THEN RAISE EXCEPTION 'Management refusal partially saved title'; END IF;
  IF (SELECT scope FROM public.notes WHERE id=folder_id) <> 'shared'
    OR (SELECT edit_policy FROM public.notes WHERE id=folder_id) <> 'specified'
    OR NOT EXISTS(SELECT 1 FROM public.note_editors WHERE note_id=folder_id AND user_id=member_id) THEN
    RAISE EXCEPTION 'Non-owner acquired permission controls';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',viewer_id,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.save_note_folder(folder_id,(response->>'updated_at')::timestamptz,payload,ARRAY[viewer_id]);
    RAISE EXCEPTION 'Expected zero-row/RLS refusal';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  response := public.save_note_article(v_article_id,folder_id,NULL,article_payload,ARRAY[]::uuid[],ARRAY[]::uuid[],
    jsonb_build_array(jsonb_build_object('id',option_a,'text','A'),jsonb_build_object('id',option_b,'text','B')),true);
  version_at := (response->>'updated_at')::timestamptz;
  BEGIN
    PERFORM public.save_note_article(v_article_id,folder_id,version_at,article_payload || '{"body":"Must roll back"}',
      ARRAY[option_a,option_b],ARRAY[option_a],jsonb_build_array(jsonb_build_object('id',option_c,'text','')),true);
    RAISE EXCEPTION 'Expected invalid added option';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT body FROM public.note_articles WHERE id=v_article_id) <> 'Before'
    OR (SELECT count(*) FROM public.note_poll_options WHERE article_id=v_article_id) <> 2 THEN RAISE EXCEPTION 'Article/poll partially saved'; END IF;
  BEGIN
    PERFORM public.save_note_article(missing_article_id,folder_id,NULL,article_payload,ARRAY[]::uuid[],ARRAY[]::uuid[],
      jsonb_build_array(jsonb_build_object('id',option_c,'text','One')),true);
    RAISE EXCEPTION 'Expected insufficient options';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.note_articles WHERE id=missing_article_id) THEN RAISE EXCEPTION 'Failed poll left orphan article'; END IF;
  BEGIN
    PERFORM public.save_note_article(v_article_id,folder_id,'2000-01-01',article_payload,ARRAY[option_a,option_b],ARRAY[option_a,option_b],'[]',true);
    RAISE EXCEPTION 'Expected article timestamp conflict';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.save_note_article(v_article_id,folder_id,version_at,article_payload,ARRAY[option_a],ARRAY[option_a],'[]',true);
    RAISE EXCEPTION 'Expected option snapshot conflict';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.save_note_article(v_article_id,folder_id,version_at,article_payload || '{"body":"Must roll back"}',ARRAY[option_a,option_b],ARRAY[]::uuid[],'[]',false);
    RAISE EXCEPTION 'Expected poll delete RLS refusal';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT body FROM public.note_articles WHERE id=v_article_id) <> 'Before'
    OR (SELECT count(*) FROM public.note_poll_options WHERE article_id=v_article_id) <> 2 THEN RAISE EXCEPTION 'RLS failure partially saved article'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',viewer_id,'role','authenticated')::text,true);
  INSERT INTO public.note_poll_votes(option_id,user_id) VALUES(option_b,viewer_id);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  IF (SELECT count(*) FROM public.note_poll_votes WHERE option_id=option_b) <> 0 THEN RAISE EXCEPTION 'Anonymous raw vote became visible'; END IF;
  BEGIN
    PERFORM public.save_note_article(v_article_id,folder_id,version_at,article_payload || '{"body":"Must roll back"}',ARRAY[option_a,option_b],ARRAY[option_a],
      jsonb_build_array(jsonb_build_object('id',option_c,'text','C')),true);
    RAISE EXCEPTION 'Expected voted-option refusal';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT body FROM public.note_articles WHERE id=v_article_id) <> 'Before' THEN RAISE EXCEPTION 'Voted-option failure changed body'; END IF;
  -- Explicitly removing the whole poll keeps the existing confirmed UI operation.
  PERFORM public.save_note_article(v_article_id,folder_id,version_at,article_payload,ARRAY[option_a,option_b],ARRAY[]::uuid[],'[]',false);
  IF EXISTS(SELECT 1 FROM public.note_poll_options WHERE article_id=v_article_id) THEN RAISE EXCEPTION 'Confirmed poll removal failed'; END IF;
  PERFORM public.save_note_article(v_article_id,folder_id,version_at,article_payload,ARRAY[]::uuid[],ARRAY[]::uuid[],
    jsonb_build_array(jsonb_build_object('id',option_a,'text','A'),jsonb_build_object('id',option_b,'text','B'),jsonb_build_object('id',option_c,'text','C')),true);
  PERFORM public.save_note_article(v_article_id,folder_id,version_at,article_payload,ARRAY[option_a,option_b,option_c],ARRAY[option_a,option_c],
    jsonb_build_array(jsonb_build_object('id',option_d,'text','D')),true);
  IF (SELECT sort_order FROM public.note_poll_options WHERE id=option_d) <= (SELECT sort_order FROM public.note_poll_options WHERE id=option_c) THEN
    RAISE EXCEPTION 'Adding after a removed middle option lost display order';
  END IF;

  INSERT INTO public.competitions(id,name,starts_on) VALUES(c1,'Atomic review A',current_date),(c2,'Atomic review B',current_date);
  SELECT id INTO actual FROM public.competitions WHERE is_countdown;
  PERFORM public.set_competition_countdown(c1,actual);
  BEGIN
    PERFORM public.set_competition_countdown('not-a-review-competition',c1);
    RAISE EXCEPTION 'Expected missing target refusal';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.competitions WHERE id=c1 AND is_countdown) THEN RAISE EXCEPTION 'Failed switch cleared countdown'; END IF;
  BEGIN
    PERFORM public.set_competition_countdown(c2,NULL);
    RAISE EXCEPTION 'Expected countdown conflict';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM set_config('test.block_countdown',c2,true);
  BEGIN
    PERFORM public.set_competition_countdown(c2,c1);
    RAISE EXCEPTION 'Expected synthetic second-write failure';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.competitions WHERE id=c1 AND is_countdown) THEN RAISE EXCEPTION 'Second-write failure cleared countdown'; END IF;
  PERFORM set_config('test.block_countdown','',true);
  PERFORM public.set_competition_countdown(c2,c1);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.set_competition_countdown(c1,c2);
    RAISE EXCEPTION 'Expected countdown management refusal';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.competitions WHERE id=c2 AND is_countdown) THEN RAISE EXCEPTION 'Denied switch changed countdown'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.set_competition_countdown(NULL,c2);
  IF EXISTS(SELECT 1 FROM public.competitions WHERE is_countdown) THEN RAISE EXCEPTION 'Countdown off failed'; END IF;

  tweet_payload := jsonb_build_object('content','Tweet before','user_id',member_id,'poll_enabled',true,
    'poll_multiple',true,'poll_anonymous',false,'poll_allow_options',true,
    'quoted_type','tweet','quoted_id',v_quoted_id,'expires_at',now()+interval '1 day',
    'image_path',owner_id::text || '/' || gen_random_uuid()::text || '.webp');
  PERFORM public.save_tweet(v_tweet_id,tweet_payload,ARRAY['A','B'],ARRAY[member_id],false,NULL);
  IF (SELECT user_id FROM public.tweets WHERE id=v_tweet_id) <> owner_id
    OR (SELECT count(*) FROM public.tweet_poll_options WHERE tweet_id=v_tweet_id) <> 2
    OR (SELECT count(*) FROM public.tweet_mentions WHERE tweet_id=v_tweet_id) <> 1 THEN
    RAISE EXCEPTION 'Tweet/poll/mention creation incomplete';
  END IF;
  BEGIN
    PERFORM public.save_tweet(failed_tweet_id,tweet_payload,ARRAY['A',''],ARRAY[member_id],false,NULL);
    RAISE EXCEPTION 'Expected tweet poll constraint failure';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.tweets WHERE id=failed_tweet_id)
    OR EXISTS(SELECT 1 FROM public.tweet_poll_options o WHERE o.tweet_id=failed_tweet_id) THEN RAISE EXCEPTION 'Failed tweet poll left orphan rows'; END IF;
  BEGIN
    PERFORM public.save_tweet(failed_tweet_id,tweet_payload,ARRAY['A','B'],ARRAY[member_id,gen_random_uuid()],false,NULL);
    RAISE EXCEPTION 'Expected mention FK failure';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.tweets WHERE id=failed_tweet_id)
    OR EXISTS(SELECT 1 FROM public.tweet_poll_options o WHERE o.tweet_id=failed_tweet_id)
    OR EXISTS(SELECT 1 FROM public.tweet_mentions m WHERE m.tweet_id=failed_tweet_id) THEN RAISE EXCEPTION 'Mention failure partially saved tweet'; END IF;
  BEGIN
    PERFORM public.save_tweet(v_tweet_id,tweet_payload,ARRAY['A','B'],ARRAY[member_id],false,NULL);
    RAISE EXCEPTION 'Expected fixed-id duplicate refusal';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF (SELECT count(*) FROM public.tweet_poll_options o WHERE o.tweet_id=v_tweet_id) <> 2
    OR (SELECT count(*) FROM public.tweet_mentions m WHERE m.tweet_id=v_tweet_id) <> 1 THEN RAISE EXCEPTION 'Duplicate attempt changed tweet relations'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  IF (SELECT count(*) FROM public.tweet_mentions m WHERE m.tweet_id=v_tweet_id) <> 1 THEN RAISE EXCEPTION 'Mention visibility changed'; END IF;
  BEGIN
    PERFORM public.save_tweet(v_tweet_id,'{"content":"Denied"}',ARRAY[]::text[],ARRAY[]::uuid[],true,'Tweet before');
    RAISE EXCEPTION 'Expected own-tweet RLS refusal';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.save_tweet(v_tweet_id,'{"content":"Tweet after"}',ARRAY[]::text[],ARRAY[]::uuid[],true,'Tweet before');
  IF NOT EXISTS(SELECT 1 FROM public.tweets t WHERE t.id=v_tweet_id AND t.content='Tweet after'
    AND t.quoted_id=v_quoted_id AND t.image_path=tweet_payload->>'image_path'
    AND t.poll_multiple AND NOT t.poll_anonymous AND t.poll_allow_options)
    OR (SELECT count(*) FROM public.tweet_poll_options o WHERE o.tweet_id=v_tweet_id) <> 2
    OR (SELECT count(*) FROM public.tweet_mentions m WHERE m.tweet_id=v_tweet_id) <> 1 THEN RAISE EXCEPTION 'Content edit replaced other tweet data'; END IF;
  BEGIN
    PERFORM public.save_tweet(v_tweet_id,'{"content":"Stale overwrite"}',ARRAY[]::text[],ARRAY[]::uuid[],true,'Tweet before');
    RAISE EXCEPTION 'Expected tweet content conflict';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT content FROM public.tweets WHERE id=v_tweet_id) <> 'Tweet after' THEN RAISE EXCEPTION 'Stale edit changed tweet'; END IF;
  PERFORM set_config('test.poll_article',v_article_id::text,true);
  RAISE NOTICE 'Atomic management: folder/editor, article/poll, countdown, tweet/poll/mention rollback; RLS/conflicts passed';
END;
$$;
RESET ROLE;
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','service_role')::text,true);
END $$;
SET LOCAL ROLE service_role;
-- Existing mirror/administrative writers must preserve the original created_by,
-- even when their JWT has a non-null sub. Normal authenticated checks stay above.
INSERT INTO public.note_poll_options(article_id,text,created_by)
VALUES(current_setting('test.poll_article')::uuid,'Synthetic mirror option',current_setting('test.viewer')::uuid);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.note_poll_options WHERE article_id=current_setting('test.poll_article')::uuid
    AND text='Synthetic mirror option' AND created_by=current_setting('test.viewer')::uuid) THEN
    RAISE EXCEPTION 'Existing service-role mirror write changed';
  END IF;
END $$;
ROLLBACK;
