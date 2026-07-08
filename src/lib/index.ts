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

/*
    |pageId: 4B
    |magicString: 4B
    |freeListHead: 4B
    |freeSpaceEnd: 2B
    |cellCount: 2B
    */

export const HEADER_SIZE = 4 + 6 + 1 + 1; // 12 bytes
const OVERHEAD_SIZE = 2; // 2 bytes for key length and value length
export class PageHeader {
	pageId: number;
	magicString: 'MAGICS';
	freeSpaceEnd: number;
	cellCount: number;
	constructor(pageId: number) {
		this.pageId = pageId;
		this.magicString = 'MAGICS';
		this.freeSpaceEnd = 255; // Assuming a default page size of 256 bytes
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

type FreeEntery = {
	offset: number;
	size: number;
};

export class Page {
	pageSize: number;
	header: PageHeader;
	cellOffset: number[];
	cellsData: Map<number, Cell>;
	availablityFreeList: FreeEntery[];
	rawData: Uint8Array;

	constructor() {
		this.header = new PageHeader(0);
		this.pageSize = 255;
		this.cellOffset = [];
		this.cellsData = new Map<number, Cell>();
		this.availablityFreeList = [];
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
		if (this.availablityFreeList.length === 0) {
			return null;
		}

		let bestIndex = -1;
		let bestSize = Infinity;

		for (let i = 0; i < this.availablityFreeList.length; i++) {
			const entery = this.availablityFreeList[i];
			if (entery.size >= spaceNeeded && entery.size < bestSize) {
				bestSize = entery.size;
				bestIndex = i;
			}
		}
		return bestIndex === -1 ? null : bestIndex;
	}

	private allocateSlot(spaceNeeded: number): number | null {
		const freeSlotIndex = this.findCellSlot(spaceNeeded);
		if (freeSlotIndex !== null) {
			return this.availablityFreeList[freeSlotIndex].offset;
		}

		const freeSpaceAvailable =
			this.header.freeSpaceEnd -
			HEADER_SIZE -
			(this.header.cellCount + 1) -
			this.availablityFreeList.length * 2;
		if (freeSpaceAvailable >= spaceNeeded) {
			this.header.freeSpaceEnd -= spaceNeeded + OVERHEAD_SIZE;
			return this.header.freeSpaceEnd - spaceNeeded + 1;
		}

		return null;
	}

	private freeSlot(offset: number, size: number) {
		this.availablityFreeList.push({ offset, size: size + OVERHEAD_SIZE });
	}

	compact(): void {}

	private findCellIndexByKey(key: string): number | null {
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

	private applyInsert(key: string, value: string): boolean {
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
		this.sortCellsByKey();
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

		// this.cellsData.delete(cellOffset);
		this.cellOffset.splice(index, 1);
		this.freeSlot(cellOffset, cellSize);
		this.header.cellCount--;
		return true;
	}

	private writeAvailabilityFreeList(buffer: Uint8Array): void {
		let cursor = HEADER_SIZE + 1; // Start after header and cell counts
		const view = new DataView(
			buffer.buffer,
			buffer.byteOffset + cursor,
			buffer.byteLength - cursor
		);
		for (const freeEntry of this.availablityFreeList) {
			view.setUint8(0, freeEntry.offset); // Write offset
			cursor += 1;
			view.setUint8(1, freeEntry.size); // Write size
			cursor += 1;
		}
	}


	private writeCellOffsetsInplace(buffer: Uint8Array): void {
		console.log(this.availablityFreeList.length);
		// We just need the calculate from the begining
		let cellOffsets = HEADER_SIZE + this.availablityFreeList.length * 2;

		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

		for (let i = 0; i < this.cellOffset.length; i++) {
			view.setUint8(cellOffsets, this.cellOffset[i]);
			cellOffsets += 1;
		}
	}

	serialize(): Uint8Array {
		const buffer = new Uint8Array(this.pageSize + 1);

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
			console.log(cellData.length, offset);
			buffer.set(cellData, offset);
		}

		this.rawData = buffer;
		return buffer;
	}

}

export const store = writable(new Page());
