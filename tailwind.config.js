/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 宋韵 · 朱砂 × 宣纸
        bg:       '#faf6ee',
        'bg-2':   '#f5efde',
        paper:    '#ffffff',
        'paper-warm': '#fdfaf3',
        ink:      '#1a1814',
        'ink-soft': '#4a4338',
        muted:    '#7a7268',
        faint:    '#b3a99a',
        border:   '#e6dec8',
        'border-soft':   '#f0e9d5',
        'border-strong': '#cfc4a5',
        accent:   '#a82828',
        'accent-2':    '#c0392b',
        'accent-deep': '#7a1c1c',
        success:  '#5a7a3a',
        warn:     '#b8860b',
        error:    '#a82828',
      },
      fontFamily: {
        display: ['"Noto Serif SC"', '"Source Han Serif SC"', '"Songti SC"', '"STSong"', '"SimSun"', 'serif'],
        sans:    ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', '"Helvetica Neue"', 'sans-serif'],
        mono:    ['"SF Mono"', '"JetBrains Mono"', 'Consolas', '"Courier New"', 'monospace'],
      },
      boxShadow: {
        paper: '0 1px 0 rgba(80,50,20,0.04), 0 8px 24px rgba(80,50,20,0.06)',
        modal: '0 4px 12px rgba(80,50,20,0.10), 0 24px 64px rgba(80,50,20,0.14)',
        img:   '0 1px 2px rgba(80,50,20,0.06), 0 4px 12px rgba(80,50,20,0.08)',
      },
    },
  },
  plugins: [],
};
