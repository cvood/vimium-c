/// <reference path="../types/base/index.d.ts" />
/// <reference path="../types/lib/index.d.ts" />
/// <reference path="../background/bg.d.ts" />
/// <reference path="../background/utils.ts" />
/// <reference path="../background/settings.ts" />

(function (): void {
const BG_ = chrome.extension.getBackgroundPage() as Window as Window & { Settings_: typeof Settings_ };
if (BG_ && !BG_.Settings_.get_("dialogMode")) {
  BG_.Backend_.focus_({
    u: BG_.Settings_.CONST_.OptionsPage_,
    r: ReuseType.reuse
  });
} else if (BG_) {
  location.href = BG_.Settings_.CONST_.OptionsPage_ + "#dialog-ui";
  return;
} else {
  chrome.tabs.create({ url: "pages/options.html" });
}
window.close();
})();
