import { NextResponse } from "next/server";
import { authorizedImageResponse } from "@/lib/image-response";
import { createClient } from "@/lib/supabase/server";
import { loginAccessResponse } from "@/lib/supabase/login-access";
import { ImageNotFoundError,logImageFailure } from "@/lib/image-storage";
import {
  AVATAR_BUCKET,
  isSafeAvatarStoragePath,
} from "@/lib/avatar-image";

export const runtime="nodejs";

const SIGNED_URL_TTL_SECONDS=7*24*60*60;
const IMAGE_CACHE_SECONDS=6*24*60*60;

export async function GET(request: Request) {
  try {
    const supabase=await createClient();
    const { data: { user },error: authError }=await supabase.auth.getUser();
    if(authError&&authError.status!==401&&authError.name!=="AuthSessionMissingError") throw authError;
    if(!user) {
      return NextResponse.json({ error: "ログインが必要です" },{ status: 401 });
    }

    const path=new URL(request.url).searchParams.get("path");
    const accessError=await loginAccessResponse(supabase);
    if(accessError) return accessError;
    if(!path||!isSafeAvatarStoragePath(path)) {
      return NextResponse.json({ error: "画像が見つかりません" },{ status: 404 });
    }

    // PC reads and R2 signing use server privileges, so apply the same
    // membership condition as the avatars Storage RLS before returning an image.
    try {
      const { data: profile,error }=await supabase
        .from("profiles")
        .select("approved")
        .eq("id",user.id)
        .maybeSingle();
      if(error) throw error;
      if(profile?.approved!==true) {
        return NextResponse.json({ error: "画像を閲覧する権限がありません" },{ status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "閲覧権限を確認できませんでした" },{ status: 503 });
    }

    // Stop serving an unreferenced path after retirement. Previously authorized
    // images/redirects retain the same six-day private cache.
    const retirement=await supabase.rpc("avatar_image_is_retired",{ p_path: path });
    if(retirement.error||typeof retirement.data!=="boolean") throw retirement.error??new Error("Invalid retirement result");
    if(retirement.data) return NextResponse.json({ error: "画像が見つかりません" },{ status: 404,headers: { "Cache-Control": "private, no-store" } });

    try {
      return await authorizedImageResponse(request,supabase,AVATAR_BUCKET,path,SIGNED_URL_TTL_SECONDS,IMAGE_CACHE_SECONDS,true);
    } catch(error) {
      if(error instanceof ImageNotFoundError) return NextResponse.json({ error: "画像が見つかりません" },{ status: 404,headers: { "Cache-Control": "private, no-store" } });
      throw error;
    }

  } catch {
    logImageFailure("avatar-read");
    return NextResponse.json({ error: "画像を取得できませんでした" },{ status: 503,headers: { "Cache-Control": "private, no-store" } });
  }
}
