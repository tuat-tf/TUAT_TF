import { NextResponse } from "next/server";
import { authorizedImageResponse } from "@/lib/image-response";
import { createClient } from "@/lib/supabase/server";
import { isSafeTweetImagePath,TWEET_IMAGE_BUCKET } from "@/lib/tweet-image";
import { ImageNotFoundError,logImageFailure } from "@/lib/image-storage";

export async function GET(request: Request) {
  try {
    const supabase=await createClient();
    const { data: { user },error: authError }=await supabase.auth.getUser();
    if(authError&&authError.status!==401&&authError.name!=="AuthSessionMissingError") throw authError;
    if(!user) return NextResponse.json({ error: "Authentication required" },{ status: 401 });
    const path=new URL(request.url).searchParams.get("path");
    if(!path||!isSafeTweetImagePath(path)) return NextResponse.json({ error: "Image not found" },{ status: 404 });
    const { data: tweet,error: queryError }=await supabase.from("tweets").select("id, expires_at").eq("image_path",path)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle();
    if(queryError) throw queryError;
    if(!tweet) return NextResponse.json({ error: "Image not found" },{ status: 404 });
    const ttl=tweet.expires_at? Math.min(300,Math.floor((Date.parse(tweet.expires_at)-Date.now())/1000)):300;
    if(ttl<=0) return NextResponse.json({ error: "Image not found" },{ status: 404 });
    try {
      return await authorizedImageResponse(request,supabase,TWEET_IMAGE_BUCKET,path,ttl,Math.min(240,Math.max(0,ttl-30)),false,tweet.expires_at?Date.parse(tweet.expires_at):undefined);
    } catch(error) {
      if(error instanceof ImageNotFoundError) return NextResponse.json({ error: "Image not found" },{ status: 404,headers: { "Cache-Control": "private, no-store" } });
      throw error;
    }
  } catch {
    logImageFailure("tweet-image-read");
    return NextResponse.json({ error: "画像を取得できませんでした" },{ status: 503,headers: { "Cache-Control": "private, no-store" } });
  }
}
