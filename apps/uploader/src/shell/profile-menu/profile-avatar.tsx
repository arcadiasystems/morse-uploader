/** The square initial avatar from the design. */
export function ProfileAvatar({ name }: { name: string }) {
	return (
		<span className="av" aria-hidden="true">
			{name.trim().charAt(0).toUpperCase() || "?"}
		</span>
	);
}
