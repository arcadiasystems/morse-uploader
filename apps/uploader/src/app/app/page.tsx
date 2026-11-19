import type { Metadata } from "next";
import { UploaderApp } from "@/shell/uploader-app";
import "@/styles/shell.css";
import "@/styles/menus.css";
import "@/styles/overview.css";
import "@/styles/files.css";
import "@/styles/sheets.css";
import "@/styles/transfers.css";
import "@/styles/inspector.css";
import "@/styles/bulk.css";
import "@/styles/palette.css";
import "@/styles/staging.css";
import { SITE_NAME, sharePreview } from "../site-metadata";

const TITLE = "Overview and files";

export const metadata: Metadata = {
	title: TITLE,
	...sharePreview({ title: `${TITLE} · ${SITE_NAME}`, path: "/app" }),
};

export default function AppPage() {
	return <UploaderApp />;
}
