// Remotion 設定
// クラウド環境（remotion.media からのChromeダウンロード不可）ではプリインストール Chromium を使う。
// Mac などローカルでは指定しない → Remotion が Chrome Headless Shell を自動取得する。
import {Config} from '@remotion/cli/config';
import fs from 'fs';

const cloudChromium = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const browser = process.env.REMOTION_BROWSER ?? (fs.existsSync(cloudChromium) ? cloudChromium : null);
if (browser) Config.setBrowserExecutable(browser);
if (process.platform === 'linux') Config.setChromiumOpenGlRenderer('swangle');
