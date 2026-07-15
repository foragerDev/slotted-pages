<script lang="ts">
	import { tick } from 'svelte';
	import { store, Cell } from '$lib/index';
	import PageHeaderView from '$lib/PageHeaderView.svelte';
	import HexTable from '$lib/HexTable.svelte';
	import { fade, slide } from 'svelte/transition';

	let keyInput: string = $state('');
	let valueInput: string = $state('');
	let searchInput: string = $state('');
	let foundResult: Cell | null = $state(null);
	let foundOffset: number | null = $state(null);
	let notExist: boolean | null = $state(null);
	let freedBytes: number = $state(0);
	let isShowAllKeysOpen: boolean = $state(false);

	let highlightedOffset: number | null = $state(null);
	const rowRefs: Record<number, HTMLTableRowElement> = {};
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;

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
			} else {
				foundOffset = null;
			}
			return page;
		});

		if (foundOffset !== null) {
			foundResult = $store.cellsData.get(foundOffset) ?? null;
			highlightedOffset = foundOffset;
			notExist = false;
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
			notExist = true;
			foundResult = null;
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
				freedBytes = page.compact();
			} catch (error) {
				console.error('Error compacting page:', error);
			}
			return page;
		});
	}

	$effect(() => {
		if (freedBytes <= 0) return;

		const timeoutId = setTimeout(() => {
			freedBytes = 0;
		}, 3000);

		return () => clearTimeout(timeoutId);
	});

	$effect(() => {
		if (notExist) {
			const timeoutId = setTimeout(() => {
				notExist = null;
			}, 3000);

			return () => clearTimeout(timeoutId);
		}
	});
</script>

<svelte:head>
	<title>Slotted Pages</title>
</svelte:head>
<div class="mx-auto min-h-dvh w-full max-w-none px-1 py-1 md:px-3 md:py-4">
	<div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2.35fr)_minmax(300px,0.8fr)] lg:gap-4">
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
					}}>New Page</button
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
						searchInput = '';
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

						{#if notExist}
							<p
								class="col-span-full mt-2 rounded-md bg-red-50 px-2 py-1 text-sm font-medium text-red-700"
								transition:fade
							>
								Cell not found.
							</p>
						{/if}
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

					<div
						class="w-full h-6.5 bg-emerald-100 rounded-2xl my-1 overflow-hidden hover:cursor-pointer hover:bg-emerald-200 transition"
						onclick={() => {
							isShowAllKeysOpen = !isShowAllKeysOpen;
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								isShowAllKeysOpen = !isShowAllKeysOpen;
							}
						}}
						tabindex="0"
						aria-label="Show All Items"
						aria-describedby="showAllItemsDescription"
						role="button"
					>
						<div class="flex flex-row content-end justify-end items-center h-full py-0.5">
							<p class="ml-2 text-gray-500 text-sm align-middle">Show All Items</p>
							<div
								class="ml-auto h-6 w-6 rounded-full bg-emerald-400 transition hover:scale-110"
								class:rotate-180={isShowAllKeysOpen}
							>
								<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#000000"
									><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g
										id="SVGRepo_tracerCarrier"
										stroke-linecap="round"
										stroke-linejoin="round"
									></g><g id="SVGRepo_iconCarrier">
										<g>
											<path fill="none" d="M0 0h24v24H0z"></path>
											<path d="M12 15l-4.243-4.243 1.415-1.414L12 12.172l2.828-2.829 1.415 1.414z"
											></path>
										</g>
									</g></svg
								>
							</div>
						</div>
					</div>
					{#if isShowAllKeysOpen}
						{@const sortedCellsData = Array.from($store.cellsData.entries()).sort((a, b) =>
							a[1].key.localeCompare(b[1].key)
						)}
						<div
							id="showAllItemsDescription"
							class="w-full rounded-lg bg-white p-2 text-sm shadow-lg"
							transition:slide
						>
							{#if sortedCellsData.length === 0}
								<p class="text-gray-500">No cells available.</p>
							{:else}
								<div class="max-h-40 overflow-y-auto">
									{#each sortedCellsData as [offset, value] (offset)}
										{@const offsets = new Set($store.cellOffset)}
										{@const isDeleted = !offsets.has(offset)}
										<div class="grid grid-cols-12 mt-0.5" class:line-through={isDeleted}>
											<span class="col-span-2 font-semibold text-sm">{offset}</span>
											<span class="col-span-4">{value.key}</span>
											<span class="col-span-4 text-gray-500">{value.value}</span>
											<span class="col-span-2 justify-end flex h-5">
												<button
													class="rounded-lg bg-red-600 px-1 py-1 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-red-700 hover:shadow"
													onclick={() => {
														deleteCell(value.key);
													}}
													title="Delete Cell"
													disabled={isDeleted}
												>
													<svg
														fill="#ffffffff"
														height="9px"
														width="9px"
														version="1.1"
														id="Capa_1"
														xmlns="http://www.w3.org/2000/svg"
														xmlns:xlink="http://www.w3.org/1999/xlink"
														viewBox="0 0 490 490"
														xml:space="preserve"
														><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g
															id="SVGRepo_tracerCarrier"
															stroke-linecap="round"
															stroke-linejoin="round"
														></g><g id="SVGRepo_iconCarrier">
															<polygon
																points="456.851,0 245,212.564 33.149,0 0.708,32.337 212.669,245.004 0.708,457.678 33.149,490 245,277.443 456.851,490 489.292,457.678 277.331,245.004 489.292,32.337 "
															></polygon>
														</g></svg
													>
												</button>
											</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
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
				{#if freedBytes > 0}
					<p
						class="mb-2 rounded-md bg-emerald-50 px-2 py-1 text-sm font-medium text-emerald-700"
						transition:fade
					>
						Compaction freed {freedBytes} bytes.
					</p>
				{/if}
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
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-0 transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
							id="keyInput"
						/>
					</div>
					<div class="space-y-1">
						<label for="valueInput" class="block font-semibold">Value:</label>
						<input
							type="text"
							bind:value={valueInput}
							placeholder="Enter value"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-0 transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
							id="valueInput"
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
