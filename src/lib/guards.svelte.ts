import { beforeNavigate } from '$app/navigation';

/**
 * Two guards against losing work, both found in UAT.
 *
 * The editors hold their state client-side, so a stray click on "← Home" threw
 * away every edit with no prompt (M4); and hard Delete — which purges a resume
 * AND its revision history — fired on a single click (M5).
 *
 * Deliberately `confirm()` rather than a custom modal: it cannot be missed, it
 * cannot be styled into invisibility, and the UX phase can replace it wholesale
 * without touching the call sites.
 */

/**
 * Warn before leaving with unsaved edits — both in-app navigation and closing
 * the tab. Call from a component's init (beforeNavigate requires it).
 *
 * `isDirty` is read at navigation time, not at registration, so pass a getter.
 */
export function guardUnsavedChanges(isDirty: () => boolean, what = 'changes'): void {
	let bypass = false;

	beforeNavigate((nav) => {
		// `leave` is the tab closing / an external URL — the browser's own
		// beforeunload prompt handles that one; a confirm() here would be ignored.
		if (nav.type === 'leave' || bypass || !isDirty()) return;
		if (!confirm(`You have unsaved ${what}. Leave this page and lose them?`)) {
			nav.cancel();
		}
	});

	$effect(() => {
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (bypass || !isDirty()) return;
			event.preventDefault();
			// Legacy browsers need returnValue set; the string is never displayed.
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	// Exposed via the returned setter below rather than a second export so the
	// caller can't accidentally disarm a different page's guard.
	guardUnsavedChanges.release = () => {
		bypass = true;
	};
}

// Set by the most recent guardUnsavedChanges() call in this component tree.
guardUnsavedChanges.release = () => {};

/**
 * Ask before a destructive submit. Use on the <form>, not the button, so it
 * catches Enter-in-a-field as well as the click:
 *
 *   <form method="POST" action="?/hardDelete" use:confirmSubmit={'Delete …?'}>
 */
export function confirmSubmit(node: HTMLFormElement, message: string) {
	let current = message;
	const onSubmit = (event: SubmitEvent) => {
		if (!confirm(current)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		// Confirmed: this navigation is intentional, so don't also nag about
		// unsaved edits on the way out.
		guardUnsavedChanges.release();
	};
	// Capture phase: run before SvelteKit's enhance handler, so cancelling here
	// stops the request rather than merely the default navigation.
	node.addEventListener('submit', onSubmit, true);
	return {
		update(next: string) {
			current = next;
		},
		destroy() {
			node.removeEventListener('submit', onSubmit, true);
		}
	};
}
