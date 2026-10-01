/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // follow咪 温暖配色（柔化版）
        // 色相沿用最初那套（黄 / 鹅黄 / 浅牛油果绿 / 深牛油果绿），
        // 统一压低饱和度、略微提亮，去掉刺眼感；深色端适度加深以保证文字对比度。
        cream: '#FBF3CB', // 浅鹅黄 #FFF7BD ↓饱和
        sun: '#F0CB74', // 明亮黄 #FDC942 ↓饱和 → 奶油金
        mint: '#D2E096', // 浅牛油果绿 #C9DD71 ↓饱和 → 柔和开心果色
        leaf: '#7E9142', // 深牛油果绿 #8DA524 ↓饱和并加深
        ink: '#4A5130', // 深橄榄（正文）
        cocoa: '#857A57', // 次要文字
        paper: '#FDFBF2', // 页面底色
      },
      boxShadow: {
        soft: '0 8px 22px -14px rgba(126,145,66,0.34)',
        card: '0 4px 16px -12px rgba(74,81,48,0.18)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
