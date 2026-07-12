import { writable } from 'svelte/store';

export class Cell {
	key: string;
	value: string;

	constructor(key: string, value: string) {
		this.key = key;
		this.value = value;
	}

	length(): number {
		return this.key.length + this.value.length;
	}
}

// This is specifically designed for page size of 256 bytes. For esier readibility on screens.
// But in real world page size is 4KB or 4096 bytes.

/*
    |pageId: 4B
    |magicString: 6B
    |freeSpaceEnd: 1B
    |cellCount: 1B
*/

export const HEADER_SIZE = 4 + 6 + 1 + 1; // 12 bytes
const OVERHEAD_SIZE = 2; // 2 bytes for key length and value
const MIN_ALLOWED_FREE_SPACE = 4; // Minimum allowed free space to avoid internal fragmentation
const PAGE_SIZE = 256; // Assuming a default page size of 256 bytes

let pageId = 0;

export class PageHeader {
	pageId: number;
	magicString: 'MAGICS';
	freeSpaceEnd: number;
	cellCount: number;
	constructor(pageId: number) {
		this.pageId = pageId;
		this.magicString = 'MAGICS';
		this.freeSpaceEnd = PAGE_SIZE - 1; // Assuming a default page size of 256 bytes
		this.cellCount = 0;
	}

	serialize(): Uint8Array {
		const buffer = new ArrayBuffer(HEADER_SIZE);
		const view = new DataView(buffer);

		view.setUint32(0, this.pageId, true); // 4 bytes for pageId
		for (let i = 0; i < 6; i++) {
			const code = i < this.magicString.length ? this.magicString.charCodeAt(i) : 0;
			view.setUint8(4 + i, code); // 6 bytes reserved for magic string (null padded)
		}
		view.setUint8(10, this.freeSpaceEnd); // 1 byte for freeSpaceEnd
		view.setUint8(11, this.cellCount); // 1 byte for cellCount

		return new Uint8Array(buffer);
	}
}

/*
    | offset: 1B
    | size: 1B
*/

type FreeEntry = {
	offset: number;
	size: number;
};

export class Page {
	pageSize: number;
	header: PageHeader;
	cellOffset: number[];
	cellsData: Map<number, Cell>;
	availabilityFreeList: FreeEntry[];
	rawData: Uint8Array;

	constructor() {
		this.header = new PageHeader(0);
		this.pageSize = PAGE_SIZE;
		this.cellOffset = [];
		this.cellsData = new Map<number, Cell>();
		this.availabilityFreeList = [];
		this.rawData = new Uint8Array(this.pageSize);
		this.serialize();
	}

	private sortCellsByKey(): void {
		this.cellOffset.sort((a, b) => {
			const keyA = this.cellsData.get(a)!.key;
			const keyB = this.cellsData.get(b)!.key;
			return keyA.localeCompare(keyB);
		});
	}

	private findCellSlot(spaceNeeded: number): number | null {
		if (this.availabilityFreeList.length === 0) {
			return null;
		}

		let bestIndex = -1;
		let bestSize = Infinity;

		for (let i = 0; i < this.availabilityFreeList.length; i++) {
			const entry = this.availabilityFreeList[i];
			if (entry.size >= spaceNeeded && entry.size < bestSize) {
				bestSize = entry.size;
				bestIndex = i;
			}
		}
		return bestIndex === -1 ? null : bestIndex;
	}

	private allocateSlot(spaceNeeded: number): number | null {
		const freeSlotIndex = this.findCellSlot(spaceNeeded);
		if (freeSlotIndex !== null) {
			const freeSlot = this.availabilityFreeList[freeSlotIndex];
			const allocatedSlot = freeSlot.offset;
			if (freeSlot.size > spaceNeeded && freeSlot.size - spaceNeeded >= MIN_ALLOWED_FREE_SPACE) {
				const remainingSize = freeSlot.size - spaceNeeded;
				const remainingOffset = allocatedSlot + spaceNeeded;
				this.availabilityFreeList[freeSlotIndex] = { offset: remainingOffset, size: remainingSize };
			} else {
				this.availabilityFreeList.splice(freeSlotIndex, 1);
			}

			return allocatedSlot;
		}

		const freeSpaceAvailable = this.calculateAvailableFreeSpace();
		// Freespace available should always be greater than spaceNeeded, as we need 1 byte for cellOffset
		if (freeSpaceAvailable >= spaceNeeded) {
			const allocatedSlot = this.header.freeSpaceEnd - spaceNeeded + 1;
			this.header.freeSpaceEnd -= spaceNeeded;
			return allocatedSlot;
		}

		return null;
	}

	private calculateAvailableFreeSpace() {
		// freeSpaceEnd: Where the free space ends in the page
		// HEADER_SIZE: The size of the page header
		// cellOffset.length: The number of cells currently in the page each 1 byte and 1 more for new cell
		// availablityFreeList.length * 2: Each free entry in the availabilityFreeList takes 2 bytes (1 for offset and 1 for size)

		return (
			this.header.freeSpaceEnd -
			HEADER_SIZE -
			(this.cellOffset.length + 1) -
			this.availabilityFreeList.length * 2
		);
	}

	private freeSlot(offset: number, size: number) {
		this.availabilityFreeList.push({ offset, size: size + OVERHEAD_SIZE });
	}

	compact(): number {

		if(this.availabilityFreeList.length === 0) {
			return 0;
		}

		const approximatedBytesCompacted = this.applyCompaction();
		this.serialize();
		return approximatedBytesCompacted;
	}

	private applyCompaction(): number {
		const newPage: Page = new Page();
		for (const offset of this.cellOffset) {
			// Assumption is that, at this point, we have enough space to insert all
			// the cells into the new page. And `offset` must exist in cellData.
			const item = this.cellsData.get(offset)!;
			const result = newPage.applyInsert(item.key, item.value, true);
			if (!result) {
				throw new Error('Compaction failed. Not enough space to insert cell.');
			}
		}
		// Sort only once
		newPage.sortCellsByKey();
		newPage.header.pageId = this.header.pageId; // Preserve the original pageId
		const approximatedFreedSpace =
			newPage.calculateAvailableFreeSpace() - this.calculateAvailableFreeSpace();

		this.header = newPage.header;
		this.cellOffset = newPage.cellOffset;
		this.cellsData = newPage.cellsData;
		this.availabilityFreeList = [];
		return approximatedFreedSpace;
	}

	findCellIndexByKey(key: string): number | null {
		let low = 0;
		let high = this.cellOffset.length - 1;

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const midKey = this.cellsData.get(this.cellOffset[mid])!.key;
			if (midKey === key) {
				return mid;
			} else if (midKey < key) {
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}
		return null;
	}

	private update(key: string, value: string, cellIndex: number) {
		// len of key + len of value
		const requiredSize = key.length + value.length;

		// Assumption is, if there is existing key it must exist in the page
		const cellOffset = this.cellOffset[cellIndex];
		const existingCellSize = this.cellsData.get(cellOffset)!.length();

		// reuse only of length is still same otherwise it will cause internal fragmentation.
		if (requiredSize === existingCellSize) {
			this.cellsData.set(cellOffset, new Cell(key, value));
		} else {
			// So we will remove oldKeyIndex from cellOffset and add that old availabilityFreeList
			this.freeSlot(cellOffset, existingCellSize);
			this.cellOffset.splice(cellIndex, 1);

			const newSlot = this.allocateSlot(requiredSize + OVERHEAD_SIZE);

			if (newSlot === null) {
				throw new Error('Not enough space to update the cell. Needs to implement compaction.');
			}

			this.cellsData.set(newSlot, new Cell(key, value));
			this.cellOffset.push(newSlot);
			this.sortCellsByKey();
		}
		return false;
	}

	insert(key: string, value: string): boolean {
		const result = this.applyInsert(key, value);
		this.serialize();
		return result;
	}

	// key: Lookup key identifier
	// value: Value to be stored
	// isCompact: For compaction process. If true, the cells will not be sorted after insertion.
	private applyInsert(key: string, value: string, isCompact: boolean = false): boolean {
		const existingIndex = this.findCellIndexByKey(key);
		if (existingIndex !== null) {
			return this.update(key, value, existingIndex);
		}

		const newCellSize = key.length + value.length + OVERHEAD_SIZE;

		const slotOffset = this.allocateSlot(newCellSize);

		if (slotOffset === null) {
			throw new Error(
				'Not enough space to insert the cell. Needs to implemented compaction. And B+Tree to allocate new pages.'
			);
		}

		this.cellsData.set(slotOffset, new Cell(key, value));
		this.cellOffset.push(slotOffset);
		this.header.cellCount++;
		if (!isCompact) {
			this.sortCellsByKey();
		}
		return true;
	}

	delete(key: string): boolean {
		const result = this.applyDelete(key);
		this.serialize();
		return result;
	}

	private applyDelete(key: string): boolean {
		const index = this.findCellIndexByKey(key);
		if (index === null) {
			return false;
		}

		const cellOffset = this.cellOffset[index];
		const cellSize = this.cellsData.get(cellOffset)!.length();

		this.cellOffset.splice(index, 1);
		this.freeSlot(cellOffset, cellSize);
		this.header.cellCount--;
		return true;
	}

	private writeAvailabilityFreeList(buffer: Uint8Array): void {
		let cursor = HEADER_SIZE; // Start after header and cell counts
		const view = new DataView(
			buffer.buffer,
			buffer.byteOffset + cursor,
			buffer.byteLength - cursor
		);
		for (const freeEntry of this.availabilityFreeList) {
			view.setUint8(0, freeEntry.offset); // Write offset
			cursor += 1;
			view.setUint8(1, freeEntry.size); // Write size
			cursor += 1;
		}
	}

	private writeCellOffsetsInplace(buffer: Uint8Array): void {
		// We just need the calculate from the begining
		let cellOffsets = HEADER_SIZE + this.availabilityFreeList.length * 2;

		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

		for (let i = 0; i < this.cellOffset.length; i++) {
			view.setUint8(cellOffsets, this.cellOffset[i]);
			cellOffsets += 1;
		}
	}

	serialize(): Uint8Array {
		const buffer = new Uint8Array(PAGE_SIZE);

		const header = this.header.serialize();

		buffer.set(header, 0);

		this.writeAvailabilityFreeList(buffer);
		this.writeCellOffsetsInplace(buffer);
		for (let i = 0; i < this.cellOffset.length; i++) {
			const offset = this.cellOffset[i];
			const cell = this.cellsData.get(offset)!;
			// Serialize the cell data (keylen + key + valuelen + value) into the buffer at the specified offset

			const keyLen = cell.key.length;
			const valueLen = cell.value.length;

			const cellData = new Uint8Array(1 + keyLen + 1 + valueLen);

			cellData[0] = keyLen;
			cellData.set(new TextEncoder().encode(cell.key), 1);
			cellData[1 + keyLen] = valueLen;
			cellData.set(new TextEncoder().encode(cell.value), 1 + keyLen + 1);
			buffer.set(cellData, offset);
		}

		this.rawData = buffer;
		return buffer;
	}

	reset(): void {
		this.header = new PageHeader(++pageId);
		this.cellOffset = [];
		this.cellsData.clear();
		this.availabilityFreeList = [];
		this.rawData = new Uint8Array(this.pageSize);
		this.serialize();
	}
}

export const store = writable(new Page());
