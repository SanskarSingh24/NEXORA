/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                bgPrimary: '#05070f',
                bgSecondary: '#0b0f1e',
                statusGreen: '#10b981',
                statusYellow: '#f59e0b',
                statusOrange: '#f97316',
                statusRed: '#ef4444',
                textMuted: '#94a3b8',
                panelBorder: '#1e294b',
                accentCyan: '#00e5ff',
                accentBlue: '#0066ff',
            },
            fontFamily: {
                inter: ['Inter', 'sans-serif'],
                outfit: ['Outfit', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
        },
    },
    plugins: [],
}
