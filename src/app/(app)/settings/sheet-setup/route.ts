import { redirect } from "next/navigation";
import { SHEET_SETUP_PATH } from "@/lib/sheet-period";

/** 旧URLはアプリの画面を描画せず転送する。認証・設定画面は従来の転送先に従う。 */
export function GET() {
  redirect(SHEET_SETUP_PATH);
}
