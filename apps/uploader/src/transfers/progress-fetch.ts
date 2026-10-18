/**
 * A `fetch` that reports how many request bytes have been sent. The Walrus
 * SDK has no progress callback; a relay upload is one POST, so the queue
 * passes this as the relay client's `fetch` (PROTOCOL-NOTES section 6) and
 * reads XMLHttpRequest's upload progress.
 */
export function createProgressFetch(
	onSent: (sentBytes: number, totalBytes: number) => void,
): typeof globalThis.fetch {
	return (input, init) =>
		new Promise<Response>((resolve, reject) => {
			const request = new XMLHttpRequest();
			const url = input instanceof Request ? input.url : input.toString();
			request.open(init?.method ?? "GET", url);
			request.responseType = "arraybuffer";
			new Headers(init?.headers).forEach((value, name) => {
				request.setRequestHeader(name, value);
			});
			request.upload.onprogress = (event) => {
				if (event.lengthComputable) onSent(event.loaded, event.total);
			};
			const signal = init?.signal;
			// The relay client turns an AbortError into ConnectionTimeoutError,
			// as native fetch rejects on an aborted request.
			const onAbort = () => {
				request.abort();
				reject(new DOMException("The request was aborted.", "AbortError"));
			};
			const settle = () => signal?.removeEventListener("abort", onAbort);
			request.onload = () => {
				settle();
				resolve(
					new Response(request.response, {
						status: request.status,
						statusText: request.statusText,
						headers: parseHeaders(request.getAllResponseHeaders()),
					}),
				);
			};
			request.onerror = () => {
				settle();
				reject(new TypeError(`The request to ${url} failed.`));
			};
			if (signal?.aborted) {
				onAbort();
				return;
			}
			signal?.addEventListener("abort", onAbort, { once: true });
			request.send(requestBody(init?.body));
		});
}

/** The body types the relay client sends: none, or the blob's bytes. */
function requestBody(body: RequestInit["body"]): XMLHttpRequestBodyInit | null {
	if (body === undefined || body === null) return null;
	if (body instanceof ReadableStream)
		throw new TypeError("Streaming request bodies cannot report progress.");
	return body;
}

function parseHeaders(raw: string): Headers {
	const headers = new Headers();
	for (const line of raw.trim().split(/[\r\n]+/)) {
		const colon = line.indexOf(":");
		if (colon > 0)
			headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
	}
	return headers;
}
