"use strict";

function nextGeneration(refreshGenerations, uriKey) {
	const generation = (refreshGenerations.get(uriKey) ?? 0) + 1;
	refreshGenerations.set(uriKey, generation);
	return generation;
}

function currentGeneration(refreshGenerations, uriKey) {
	return refreshGenerations.get(uriKey) ?? 0;
}

function isWolframFileDocument(document) {
	return (
		document?.languageId === "wolfram" && document?.uri?.scheme === "file"
	);
}

function scheduleDiagnostics({
	document,
	collection,
	refreshTimers,
	refreshGenerations,
	activeDiagnostics,
	pendingDiagnostics,
	delay = 150,
	clearExisting = false,
	generation,
	collectDiagnostics,
	log,
}) {
	if (!isWolframFileDocument(document)) return;
	const uriKey = document.uri.toString();
	const scheduledGeneration =
		generation ?? nextGeneration(refreshGenerations, uriKey);

	const existingTimer = refreshTimers.get(uriKey);
	if (existingTimer) clearTimeout(existingTimer);

	if (clearExisting) {
		collection.set(document.uri, []);
	}

	if (activeDiagnostics?.has(uriKey)) {
		const existingPending = pendingDiagnostics?.get(uriKey);
		pendingDiagnostics?.set(uriKey, {
			document,
			delay,
			clearExisting: existingPending?.clearExisting || clearExisting,
			generation: scheduledGeneration,
		});
		return;
	}

	const timer = setTimeout(() => {
		refreshTimers.delete(uriKey);
		const run = Promise.resolve()
			.then(() =>
				collectDiagnostics(document, collection, scheduledGeneration),
			)
			.catch((err) => {
				log?.(`collectDiagnostics outer error: ${err?.stack ?? err}`);
			})
			.finally(() => {
				activeDiagnostics?.delete(uriKey);

				const pending = pendingDiagnostics?.get(uriKey);
				if (!pending) return;
				pendingDiagnostics.delete(uriKey);
				scheduleDiagnostics({
					document: pending.document,
					collection,
					refreshTimers,
					refreshGenerations,
					activeDiagnostics,
					pendingDiagnostics,
					delay: pending.delay,
					clearExisting: pending.clearExisting,
					generation: pending.generation,
					collectDiagnostics,
					log,
				});
			});

		activeDiagnostics?.set(uriKey, run);
	}, delay);

	refreshTimers.set(uriKey, timer);
}

module.exports = {
	currentGeneration,
	isWolframFileDocument,
	scheduleDiagnostics,
};
