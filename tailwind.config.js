/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Roboto', 'sans-serif'],
            },
            colors: {
                // Jet Black & Deep Purple Palette
                surface: {
                    DEFAULT: '#000000',
                    container: '#080808',
                    'container-high': '#121212',
                    variant: '#1a1a1a',
                },
                primary: {
                    DEFAULT: '#BB86FC',
                    50: '#f3e8ff',
                    100: '#e9d5ff',
                    200: '#d8b4fe',
                    300: '#c084fc',
                    400: '#a78bfa',
                    500: '#BB86FC',
                    600: '#7c3aed',
                    700: '#6d28d9',
                    800: '#5b21b6',
                    900: '#4c1d95',
                    container: '#2F1545',
                },
                'on-surface': {
                    DEFAULT: '#ffffff',
                    variant: '#CAC4D0',
                },
                outline: {
                    DEFAULT: '#49454F',
                    variant: '#222222',
                },
            },
            boxShadow: {
                'purple-glow': '0 0 15px rgba(187, 134, 252, 0.15)',
                'purple-glow-lg': '0 0 25px rgba(187, 134, 252, 0.2), 0 0 1px rgba(187, 134, 252, 0.4)',
                'purple-glow-button': '0 0 15px rgba(187, 134, 252, 0.4)',
            },
            borderRadius: {
                'm3': '28px',
                'm3-sm': '12px',
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
            },
        },
    },
    plugins: [],
}
