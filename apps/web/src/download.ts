/** Offers some data to the user as a file download, named `fileName`. */
export function downloadFile(fileName: string, data: Uint8Array | string, mime: string): void {
	const blob = new Blob([data as BlobPart], { type: mime });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.style.display = 'none';
	document.body.appendChild(link);
	link.click();
	link.remove();
	// The browser reads the blob asynchronously, so give it time before letting go.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
