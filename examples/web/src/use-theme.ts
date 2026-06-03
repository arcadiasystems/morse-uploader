import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "morse-uploader-theme";

function getInitialTheme(): Theme {
	if (typeof window === "undefined") {
		return "light";
	}
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark") {
		return stored;
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

/** Light/dark theme persisted to localStorage and applied as `data-theme`. */
export function useTheme(): { theme: Theme; toggle: () => void } {
	const [theme, setTheme] = useState<Theme>(getInitialTheme);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		window.localStorage.setItem(STORAGE_KEY, theme);
	}, [theme]);

	const toggle = () =>
		setTheme((current) => (current === "light" ? "dark" : "light"));

	return { theme, toggle };
}
