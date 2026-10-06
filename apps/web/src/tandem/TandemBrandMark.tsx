import { APP_BASE_NAME } from "../branding";
import tandemMark from "../assets/tandem-mark.png";

/** The Tandem app icon next to the wordmark. Hidden when a host injects another name. */
export function TandemBrandMark() {
  if (APP_BASE_NAME !== "Tandem") return null;

  return <img src={tandemMark} alt="" className="h-4 w-4 shrink-0 self-center rounded-[4px]" />;
}
