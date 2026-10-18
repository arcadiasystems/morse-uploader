import type { Metadata } from "next";
import { UploaderApp } from "@/shell/uploader-app";
import "@/styles/shell.css";
import "@/styles/menus.css";
import "@/styles/overview.css";
import "@/styles/files.css";
import "@/styles/upload.css";
import "@/styles/transfers.css";
import "@/styles/inspector.css";
import "@/styles/bulk.css";

export const metadata: Metadata = {
	title: "Overview and files",
};

export default function AppPage() {
	return <UploaderApp />;
}
