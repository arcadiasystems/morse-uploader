import type { Metadata } from "next";
import { UploaderApp } from "@/shell/uploader-app";
import "@/styles/shell.css";
import "@/styles/menus.css";
import "@/styles/blobs.css";
import "@/styles/local.css";
import "@/styles/upload.css";
import "@/styles/transfers.css";
import "@/styles/drawer.css";

export const metadata: Metadata = {
	title: "Walrus",
};

export default function AppPage() {
	return <UploaderApp />;
}
