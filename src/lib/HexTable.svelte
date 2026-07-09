<script lang="ts">
	import { Page, HEADER_SIZE } from '$lib/index';
	let { page } = $props<{ page: Page }>();

	const memoryDumpSections = [
		{ title: 'Header', color: 'bg-amber-500' },
		{ title: 'Cell Offsets', color: 'bg-blue-500' },
		{ title: 'Cell Data', color: 'bg-green-500' },
		{ title: 'Free List', color: 'bg-orange-500' },
		{ title: 'Fragmented/Deleted', color: 'bg-red-500' }
	];

	// Page layout (all bounds are exclusive at end):
	//   [0, HEADER_SIZE)                          → Header
	//   [HEADER_SIZE, freeListEnd)                → Free list metadata (2 bytes per entry)
	//   [freeListEnd, cellOffsetEnd)              → Cell offset array (1 byte per entry)
	//   cellOffset[i] .. +size                   → Cell data (grows from end)
	//   availabilityFreeList[i].offset .. +size  → Freed/fragmented region
	const freeListEnd = $derived(HEADER_SIZE + page.availabilityFreeList.length * 2);
	const cellOffsetEnd = $derived(freeListEnd + page.cellOffset.length);

	let hoveredRange: { start: number; end: number } | null = $state(null);

	function getByteCategory(index: number): string | null {
		if (index < HEADER_SIZE) return 'HEADER';
		if (index < freeListEnd) return 'FREE_LIST';
		if (index < cellOffsetEnd) return 'CELL_OFFSETS';
		for (const offset of page.cellOffset) {
			const cell = page.cellsData.get(offset)!;
			const size = 2 + cell.key.length + cell.value.length;
			if (index >= offset && index < offset + size) return 'CELL_DATA';
		}
		for (const entry of page.availabilityFreeList) {
			if (index >= entry.offset && index < entry.offset + entry.size) return 'FRAGMENTED';
		}
		return null;
	}

	function getCategoryColor(category: string | null): string {
		switch (category) {
			case 'HEADER': return 'bg-amber-500';
			case 'CELL_OFFSETS': return 'bg-blue-500';
			case 'CELL_DATA': return 'bg-green-500';
			case 'FREE_LIST': return 'bg-orange-500';
			case 'FRAGMENTED': return 'bg-red-500';
			default: return '';
		}
	}

	// Returns the data range to highlight when hovering a cell-offset or free-list byte.
	function getHoverRange(index: number): { start: number; end: number } | null {
		// Hovering a free-list metadata byte → show the freed region it describes
		if (index >= HEADER_SIZE && index < freeListEnd) {
			const entryIndex = Math.floor((index - HEADER_SIZE) / 2);
			const entry = page.availabilityFreeList[entryIndex];
			if (entry) return { start: entry.offset, end: entry.offset + entry.size };
		}
		// Hovering a cell-offset byte → show the cell data it points to
		if (index >= freeListEnd && index < cellOffsetEnd) {
			const cellIndex = index - freeListEnd;
			const offset = page.cellOffset[cellIndex];
			const cell = page.cellsData.get(offset);
			if (cell) {
				const size = 2 + cell.key.length + cell.value.length;
				return { start: offset, end: offset + size };
			}
		}
		return null;
	}

	function getByteColor(index: number): string {
		if (hoveredRange && index >= hoveredRange.start && index < hoveredRange.end) {
			return 'bg-yellow-300';
		}
		return getCategoryColor(getByteCategory(index));
	}


	const bytesPerRow = 16;

	const rows = $derived(Math.ceil(page.rawData.length / bytesPerRow));
	const byteColumns = Array.from({ length: bytesPerRow }, (_, i) => i);
	const rowIndices = $derived(Array.from({ length: rows }, (_, i) => i));

	function hex(value: number) {
		return value.toString(16).toUpperCase().padStart(2, '0');
	}

	function address(row: number) {
		return (row * bytesPerRow).toString(16).toUpperCase().padStart(8, '0');
	}

	function ascii(byte: number) {
		return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
	}
</script>

<div class="font-mono text-sm p-1 m-1 overflow-y-auto">
	<!-- Header -->
	<div class="flex flex-row gap-2 items-center mb-3">
		{#each memoryDumpSections as section (section.title)}
			<div class="flex flex-row gap-1 items-center">
				<div class="border border-gray-300 p-1">
					<div class={`${section.color} h-4 w-4 p-1`}></div>
				</div>
				<span class="font-bold">{section.title}</span>
			</div>
		{/each}
	</div>
	<div class="overflow-x-auto max-w-full">
		<div class="border border-gray-300" style="min-width: 700px;">
		<div class="sticky top-0 z-10 grid bg-gray-100" style="grid-template-columns:100px 1fr 180px;">
			<div class="p-2 font-semibold border-r">Address</div>

			<div
				class="grid p-2 border-r"
				style="grid-template-columns:repeat({bytesPerRow},minmax(0,1fr));"
			>
				{#each byteColumns as i (i)}
					<div class="text-center font-semibold">
						{hex(i)}
					</div>
				{/each}
			</div>

			<div class="p-2 font-semibold">ASCII</div>
		</div>

		{#each rowIndices as row (row)}
			<div
				class="grid border-b last:border-b-0 hover:bg-blue-50"
				style="grid-template-columns:100px 1fr 180px;"
			>
				<!-- Address -->
				<div class="p-2 border-r text-gray-500 text-md">
					{address(row)}
				</div>

				<!-- Hex -->
				<div
					class="grid p-2 border-r"
					style="grid-template-columns:repeat(16,minmax(0,1fr));"
				>
					{#each byteColumns as col (col)}
						{@const index = row * bytesPerRow + col}

						<div
						class={`cursor-pointer rounded text-center ${getByteColor(index)} mx-0.5
						`}
						role="button"
						tabindex="0"
						onmouseover={() => { hoveredRange = getHoverRange(index); }}
						onmouseleave={() => { hoveredRange = null; }}
						onfocus={() => { hoveredRange = getHoverRange(index); }}
						onblur={() => { hoveredRange = null; }}
						aria-label={`Byte ${index}`}
						>
							{#if index < page.rawData.length}
								{hex(page.rawData[index])}
							{/if}
						</div>
					{/each}
				</div>

				<!-- ASCII -->
				<div class="p-2 tracking-wider">
					{#each byteColumns as col (col)}
						{@const index = row * bytesPerRow + col}

						{#if index < page.rawData.length}
							{ascii(page.rawData[index])}
						{/if}
					{/each}
				</div>
			</div>
		{/each}
		</div>
	</div>
</div>
