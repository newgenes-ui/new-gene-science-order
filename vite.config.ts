import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

// ── oklch → hex 빌드타임 변환 플러그인 ─────────────────────────────────────
// html2canvas가 oklch를 파싱하지 못하므로, 빌드 시점에 모든 oklch를 hex로 변환
function oklchToHex(raw: string): string {
  const m = raw.match(
    /oklch\(\s*([\d.]+%?|none)\s+([\d.]+%?|none)\s+([\d.]+|none)\s*(?:\/\s*([\d.]+%?|none))?\s*\)/
  );
  if (!m) return raw;

  let L = m[1] === 'none' ? 0 : parseFloat(m[1]);
  if (m[1].endsWith('%')) L /= 100;
  let C = m[2] === 'none' ? 0 : parseFloat(m[2]);
  if (m[2].endsWith('%')) C = (C / 100) * 0.4;
  const Hdeg = m[3] === 'none' ? 0 : parseFloat(m[3]);
  const H = (Hdeg * Math.PI) / 180;

  // oklch → oklab
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);

  // oklab → linear-sRGB (via LMS cube roots)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3;
  const ml = m_ ** 3;
  const s = s_ ** 3;

  let R = +4.0767416621 * l - 3.3077115913 * ml + 0.2309699292 * s;
  let G = -1.2684380046 * l + 2.6097574011 * ml - 0.3413193965 * s;
  let B = -0.0041960863 * l - 0.7034186147 * ml + 1.7076147010 * s;

  const gamma = (x: number) =>
    x >= 0.0031308 ? 1.055 * Math.pow(x, 1 / 2.4) - 0.055 : 12.92 * x;
  const clamp = (x: number) =>
    Math.round(Math.max(0, Math.min(1, gamma(x))) * 255);

  const rr = clamp(R);
  const gg = clamp(G);
  const bb = clamp(B);
  let hex = '#' + [rr, gg, bb].map(c => c.toString(16).padStart(2, '0')).join('');

  // 알파값 처리
  if (m[4] != null && m[4] !== 'none') {
    let alpha = parseFloat(m[4]);
    if (m[4].endsWith('%')) alpha /= 100;
    if (alpha < 1) {
      hex += Math.round(alpha * 255).toString(16).padStart(2, '0');
    }
  }
  return hex;
}

function oklchRemoverPlugin() {
  return {
    name: 'vite-plugin-oklch-to-hex',
    enforce: 'post' as const,
    // 개발/빌드 모드: CSS transform 단계에서 oklch 제거
    transform(code: string, id: string) {
      if (/\.css/.test(id) && code.includes('oklch')) {
        return { code: code.replace(/oklch\([^)]+\)/g, oklchToHex), map: null };
      }
    },
    // 프로덕션 빌드 최종 단계: 번들된 CSS 에셋에서 oklch 완전 제거
    generateBundle(_: unknown, bundle: Record<string, { type: string; source?: string | Uint8Array }>) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'asset' && typeof chunk.source === 'string' && chunk.source.includes('oklch')) {
          chunk.source = chunk.source.replace(/oklch\([^)]+\)/g, oklchToHex);
        }
      }
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), oklchRemoverPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
