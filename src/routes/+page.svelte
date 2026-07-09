<script lang="ts">
	import { tick } from 'svelte';
	import { store, Cell } from '$lib/index';
	import PageHeaderView from '$lib/PageHeaderView.svelte';
	import HexTable from '$lib/HexTable.svelte';
	// const pageSizs: Array<number> = [256, 512, 1024, 2048, 4096];
	// let rowSize: number  = $state(16);
	// let selectedPageSize = $state(1024);

	// let colSize: number = $derived(
	//      selectedPageSize / rowSize
	// );

	let keyInput: string = $state('');
	let valueInput: string = $state('');
	let searchInput: string = $state('');
	let foundResult: Cell | null = $state(null);
	let foundOffset: number | null = $state(null);

	let highlightedOffset: number | null = $state(null);
	const rowRefs: Record<number, HTMLTableRowElement> = {};
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;

	// function registerRow(node: HTMLTableRowElement, offset: number) {
	// 	rowRefs[offset] = node;

	// 	return {
	// 		update(newOffset: number) {
	// 			if (newOffset !== offset) {
	// 				delete rowRefs[offset];
	// 				offset = newOffset;
	// 				rowRefs[offset] = node;
	// 			}
	// 		},
	// 		destroy() {
	// 			delete rowRefs[offset];
	// 		}
	// 	};
	// }

	function insert(key: string, value: string) {
		const normalizedKey = key.trim();
		const normalizedValue = value.trim();

		store.update((page) => {
			try {
				page.insert(normalizedKey, normalizedValue);
			} catch (error) {
				console.error('Error inserting cell:', error);
			}
			return page;
		});
	}

	async function findCell(key: string) {
		const normalizedKey = key.trim();

		store.update((page) => {
			const cellIndex = page.findCellIndexByKey(normalizedKey);
			if (cellIndex !== null) {
				foundOffset = page.cellOffset[cellIndex];
			}
			else {
				foundOffset = null;
			}
			return page;
		});

		if (foundOffset !== null) {
			foundResult = $store.cellsData.get(foundOffset) ?? null;
			highlightedOffset = foundOffset;
			await tick();
			rowRefs[foundOffset]?.scrollIntoView({
				behavior: 'smooth',
				block: 'center',
				inline: 'nearest'
			});

			if (highlightTimer) {
				clearTimeout(highlightTimer);
			}
			highlightTimer = setTimeout(() => {
				if (highlightedOffset === foundOffset) {
					highlightedOffset = null;
				}
			}, 1300);
		} else {
			console.warn(`Cell with key "${normalizedKey}" not found.`);
		}
	}

	function deleteCell(key: string) {
		const normalizedKey = key.trim();
		store.update((page) => {
			page.delete(normalizedKey);
			return page;
		});
	}

	function compactPage() {
		store.update((page) => {
			try {
				page.compact();
			} catch (error) {
				console.error('Error compacting page:', error);
			}
			return page;
		});
	}
	// $effect(() => {

	// })
</script>

<svelte:head>
	<title>Slotted Pages</title>
</svelte:head>
<div
	class="mx-auto min-h-dvh w-full max-w-none px-1 py-1 md:px-3 md:py-4"
>
	<div
		class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2.35fr)_minmax(300px,0.8fr)] lg:gap-4"
	>
		<div class="panel flex flex-col">
			<div class="flex flex-row items-center justify-between">
				<div class="mb-2 text-center text-sm font-bold md:text-left">Hex View</div>
				<button
					class="mb-2 ml-auto rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
					onclick={() => {
						store.update((page) => {
							page.reset();
							return page;
						});
					}}>Reset</button
				>
			</div>
			<div class="rounded-lg border border-gray-300">
				<HexTable page={$store} />
			</div>
		</div>

		<div class="flex flex-col gap-3 lg:min-h-0">
			<div class="panel p-3">
				<p class="mb-2 text-center text-sm font-bold md:text-left">Page Header</p>
				<PageHeaderView header={$store.header} />
			</div>
			<div class="panel p-3">
				<p class="mb-2 text-center text-sm font-bold tracking-wide md:text-left">Key Lookup</p>

				<form
					onsubmit={(event) => {
						event.preventDefault();
						findCell(searchInput);
					}}
				>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
						<input
							type="text"
							id="searchInput"
							bind:value={searchInput}
							placeholder="Enter key (e.g. user:42)"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-0 transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
						/>
						<button
							type="submit"
							class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-emerald-800 hover:shadow"
						>
							Find
						</button>
					</div>

					{#if foundResult !== null}
						{@const { key, value } = foundResult}
						<p
							class="mt-2 rounded-md px-2 py-1 text-sm font-medium transition bg-emerald-50 text-emerald-700"
						>
							Cell found at data index {foundOffset}
						</p>

						<div class="grid grid-cols-3">
							<div>{key}</div>
							<div>{value}</div>
							<div>
								<button
									class="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-red-700 hover:shadow"
									onclick={() => {
										deleteCell(key);
										foundResult = null;
										foundOffset = null;
									}}
								>
									Delete
								</button>
							</div>
						</div>
					{:else}
						<p class="mt-2 text-sm text-gray-500">
							Search by exact key to jump to the row in Hex View.
						</p>
					{/if}
				</form>
			</div>

			<div class="panel p-3">
				<div class="mb-2 flex items-center justify-between gap-2">
					<p class="text-sm font-bold">Cell Actions</p>
					<button
						type="button"
						class="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
						onclick={compactPage}
					>
						Compact
					</button>
				</div>
				<form
					onsubmit={(event) => {
						event.preventDefault();
						if (keyInput && valueInput) {
							insert(keyInput, valueInput);
							keyInput = '';
							valueInput = '';
						}
					}}
					class="space-y-3"
				>
					<div class="space-y-1">
						<label for="keyInput" class="block font-semibold">Key:</label>
						<input
							type="text"
							bind:value={keyInput}
							placeholder="Enter key"
							class="w-full border border-gray-300"
						/>
					</div>
					<div class="space-y-1">
						<label for="valueInput" class="block font-semibold">Value:</label>
						<input
							type="text"
							bind:value={valueInput}
							placeholder="Enter value"
							class="w-full border border-gray-300"
						/>
					</div>
					<button type="submit" class="mt-1 w-full text-sm">Insert Cell</button>
				</form>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes cell-pop {
		0% {
			box-shadow: inset 0 0 0 9999px rgba(16, 185, 129, 0.06);
			transform: translateY(6px);
		}
		35% {
			box-shadow: inset 0 0 0 9999px rgba(16, 185, 129, 0.2);
			transform: translateY(0);
		}
		100% {
			box-shadow: inset 0 0 0 9999px rgba(16, 185, 129, 0);
			transform: translateY(0);
		}
	}
</style>
