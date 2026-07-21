<script lang="ts">
	let { data } = $props();
</script>

<main>
	<h1>PeteDio Resume Builder</h1>

	{#if data.user}
		<p class="status ok">Signed in as {data.user.email}</p>
	{:else}
		<p class="status denied">Not provisioned. Sign in via Cloudflare Access.</p>
	{/if}

	<p class="note">
		P1 scaffold — platform wiring only. Resume generation is not implemented yet.
	</p>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 4rem auto;
		padding: 0 1.5rem;
		font-family: system-ui, sans-serif;
	}

	.status {
		font-size: 1.1rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
	}

	.status.ok {
		background: #e6f4ea;
		color: #1e4620;
	}

	.status.denied {
		background: #fdecea;
		color: #611a15;
	}

	.note {
		color: #666;
		font-size: 0.9rem;
	}
</style>
