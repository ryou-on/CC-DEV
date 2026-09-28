// Remotion 設定：プリインストール済み Chromium を使用（remotion.media からのDLは不可のため）
import {Config} from '@remotion/cli/config';

Config.setBrowserExecutable(process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell');
Config.setChromiumOpenGlRenderer('swangle');
