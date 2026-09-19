/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: ["./src/**/*.{html,ts,scss}"],
    theme: {
        extend: {
            colors: {
                /**
                 * Paleta de Mi Pimpollito.
                 *
                 * Los valores son los mismos que las variables CSS del login ya
                 * aprobado (--pimpollito-*), para que el diseño y los tokens de
                 * Tailwind no puedan divergir.
                 *
                 * Se conserva la FORMA de los tokens heredados
                 * (DEFAULT/hover/light/soft/dark/darker) para que las clases que
                 * ya usan los componentes reutilizados sigan resolviendo.
                 */
                primary: {
                    DEFAULT: "#d71920", // rojo de marca
                    hover: "#b81218",
                    light: "#e04a51",
                    soft: "#fdecec",
                    dark: "#8d0a10",
                    darker: "#6b070c",
                },

                carbon: {
                    DEFAULT: "#1f2226", // grafito frío: texto, topbar, sidebar
                    light: "#343a43",
                    soft: "#f3f4f6",
                    dark: "#1b1e22",
                },

                gold: {
                    DEFAULT: "#d8a23d",
                    light: "#f1cd76",
                    soft: "#fff5d8",
                    dark: "#a97c2f",
                },

                cream: {
                    DEFAULT: "#f5f6f8", // fondo de aplicación
                    dark: "#e5e7eb",
                },

                giraffe: {
                    DEFAULT: "#e0902b", // amarillo/naranja de la jirafa
                    light: "#f2b45c",
                    soft: "#fff3e0",
                    dark: "#b6721f",
                },

                /** Alias conservados: los usan componentes reutilizados. */
                brand: {
                    DEFAULT: "#d71920",
                    light: "rgba(215, 25, 32, 0.7)",
                    dark: "#8d0a10",
                    soft: "#fff5d8",
                    medium: "#d8a23d",
                },

                "primary-clear": {
                    DEFAULT: "#343a43",
                    hover: "#2a2f36",
                    soft: "#eef0f3",
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
