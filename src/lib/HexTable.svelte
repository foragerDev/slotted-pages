<script lang="ts">
	import { Page, HEADER_SIZE } from '$lib/index';
	let { page } = $props<{ page: Page }>();

	const headerEnd = $derived(HEADER_SIZE);
	const cellOffsetEnd = $derived(
		headerEnd + page.cellOffset.length + page.availabilityFreeList.length * 2
	);
	const memoryDumpSections = $derived([
		{ title: 'Header', color: 'bg-amber-500' },
		{
			title: 'Cell Offsets',
			color: 'bg-blue-500'
		},
		{
			title: 'Cell Data',
			color: 'bg-green-500'
		},
		{
			title: 'Free List',
			color: 'bg-orange-500'
		},
		{
			title: 'Fragmented/Deleted',
			color: 'bg-red-500'
		}
	]);

	function selectMemorySection(section: { start: number; end: number }): string | null {
        // end is exclusive
		const { start, end } = section;
		const [freeListStart, freeListEnd] = [
			headerEnd,
			headerEnd + 1 + page.availablityFreeList.length * 2
		];

        const [cellOffsetStart, cellOffsetEnd] = [
            freeListEnd,
            freeListEnd + page.cellOffset.length
        ];

		if (start >= 0 && end < headerEnd) {
			return 'HEADER';
        } else if (start >= freeListStart && end < freeListEnd) {
            return 'FREE_LIST';
        } else if (start >= cellOffsetStart && end < cellOffsetEnd) {
			return 'CELL_OFFSETS';
		} else if (start >= cellOffsetEnd && end < page.pageSize) {
			return 'CELL_DATA';
		} else {
			console.warn('Selected memory section is out of bounds');
			return null;
		}
	}

    function getMemorySectionColor(section: string | null): string {
        switch (section) {
            case 'HEADER':
                return 'bg-amber-500';
            case 'CELL_OFFSETS':
                return 'bg-blue-500';
            case 'CELL_DATA':
                return 'bg-green-500';
            case 'FREE_LIST':
                return 'bg-orange-500';
            default:
                return '';
        }
    }

    // function colorTheSection()


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

<div class="font-mono text-sm overflow-auto h-200 p-1 m-1">
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
	<div class="border border-gray-300">
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
				<div class="grid p-2 border-r" style="grid-template-columns:repeat(16,minmax(0,1fr));">
					{#each byteColumns as col (col)}
						{@const index = row * bytesPerRow + col}

						<div
							class="cursor-pointer rounded text-center hover:bg-yellow-200"
							role="button"
							tabindex="0"
							onmouseover={() => selectMemorySection({ start: index, end: index + 1 })}
							onfocus={() => selectMemorySection({ start: index, end: index + 1 })}
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
