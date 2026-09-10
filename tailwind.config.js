/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: ["./src/**/*.{html,ts,scss}"],
    theme: {
        extend: {
            colors: {
                /**
                 * Compatibilidad con clases existentes:
                 * bg-primary, text-primary, bg-primary-soft, bg-brand-soft, etc.
                 */
                primary: {
                    DEFAULT: "#00565c",
                    hover: "#08777c",
                    light: "#2b858a",
                    soft: "#eef7f4",
                    dark: "#004349",
                    darker: "#002f33",
                },

                "primary-clear": {
                    DEFAULT: "#67ad3d",
                    hover: "#7cc94f",
                    soft: "#dff0d7",
                },

                brand: {
                    DEFAULT: "#67ad3d",
                    light: "rgba(103, 173, 61, 0.7)",
                    dark: "#4f9430",
                    soft: "#eef7f4",
                    medium: "#2b858a",
                },

                secondary: {
                    DEFAULT: "#67ad3d",
                    soft: "#cde7c2",
                    dark: "#4f9430",
                },

                "brand-blue": {
                    DEFAULT: "#00565c",
                    light: "rgba(0, 86, 92, 0.7)",
                    dark: "#004349",
                    soft: "#eef7f4",
                },

                "forest-light": "#67ad3d",
                "forest-dark": "#00565c",

                /**
                 * Nueva paleta CLIRE explícita:
                 * bg-clire-primary, text-clire-green, bg-clire-soft, etc.
                 */
                clire: {
                    primary: "#00565c",
                    "primary-dark": "#004349",
                    "primary-light": "#08777c",
                    green: "#67ad3d",
                    "green-dark": "#4f9430",
                    soft: "#eef7f4",
                    text: "#103f49",
                },

                danger: {
                    DEFAULT: "#ba1717",
                    soft: "#f9f2f2",
                    dark: "#821010",
                },

                warning: {
                    DEFAULT: "#e9c400",
                    soft: "#fcfaf1",
                    dark: "#a38900",
                },

                success: {
                    DEFAULT: "#03781d",
                    soft: "#f0f9f2",
                    dark: "#025414",
                },

                info: {
                    DEFAULT: "#006fd5",
                    soft: "#f0f8ff",
                    dark: "#004d95",
                },
            },

            screens: {
                "sm-420": "420px",
            },
        },
    },
    plugins: [],
};
