import { Moon, Sun } from "lucide-react";
import type { Theme } from "../use-theme";

export function ThemeToggle({
	theme,
	onToggle,
}: {
	theme: Theme;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			className="icon-btn"
			aria-label="Toggle color theme"
			onClick={onToggle}
		>
			{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
		</button>
	);
}
