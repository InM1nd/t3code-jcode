import { APP_BASE_NAME } from "../branding";
import tandemMark from "../assets/tandem-mark.png";

/** The Tandem app icon, shown next to the wordmark. Renders nothing on non-Tandem builds (plain T3 Code). */
export function TandemBrandMark() {
  if (APP_BASE_NAME !== "Tandem") return null;

  return <img src={tandemMark} alt="" className="h-5 w-5 shrink-0 rounded-[5px]" />;
}
