import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, Page, HEADER_SIZE } from '../src/lib/index.ts';

function activeCells(page: Page) {
	return page.cellOffset.map((offset) => {
		const cell = page.cellsData.get(offset);
		assert.ok(cell, `missing cell at offset ${offset}`);
		return { offset, key: cell.key, value: cell.value };
	});
}

test('fresh page starts empty and serialized header is valid', () => {
	const page = new Page();

	assert.equal(page.header.pageId, 0);
	assert.equal(page.header.cellCount, 0);
	assert.equal(page.header.freeSpaceEnd, 255);
	assert.equal(page.cellOffset.length, 0);
	assert.equal(page.availabilityFreeList.length, 0);
	assert.equal(page.rawData.length, 256);
	assert.deepEqual(Array.from(page.rawData.slice(0, 12)), [0, 0, 0, 0, 77, 65, 71, 73, 67, 83, 255, 0]);
	assert.equal(HEADER_SIZE, 12);
});

test('insert, lookup, delete and reinsertion work for ASCII keys', () => {
	const page = new Page();

	assert.equal(page.insert('b', '22'), true);
	assert.equal(page.insert('a', '1'), true);
	assert.deepEqual(activeCells(page).map(({ key, value }) => [key, value]), [
		['a', '1'],
		['b', '22']
	]);
	assert.equal(page.findCellIndexByKey('a'), 0);
	assert.equal(page.findCellIndexByKey('b'), 1);
	assert.equal(page.delete('missing'), false);
	assert.equal(page.delete('a'), true);
	assert.equal(page.findCellIndexByKey('a'), null);
	assert.equal(page.header.cellCount, 1);
	assert.equal(page.insert('a', '11'), true);
	assert.equal(page.findCellIndexByKey('a'), 0);
	assert.deepEqual(activeCells(page).map(({ key, value }) => [key, value]), [
		['a', '11'],
		['b', '22']
	]);
});

test('updates preserve the logical key set when value length changes', () => {
	const page = new Page();

	page.insert('a', '1');
	page.insert('b', '22');
	const beforeOffsets = [...page.cellOffset];

	assert.equal(page.insert('b', '2222'), true);
	assert.equal(page.header.cellCount, 2);
	assert.equal(page.findCellIndexByKey('b'), 1);
	assert.equal(page.cellsData.get(page.cellOffset[1])?.value, '2222');
	assert.notDeepEqual(page.cellOffset, beforeOffsets);
	assert.ok(page.availabilityFreeList.length >= 1);
});

test('empty strings and unicode keys serialize correctly', () => {
	const page = new Page();

	assert.equal(page.insert('', ''), true);
	assert.equal(page.insert('é', 'x'), true);
	assert.equal(page.insert('😀', '🙂'), true);
	assert.equal(page.findCellIndexByKey(''), 0);
	assert.equal(page.findCellIndexByKey('é') !== null, true);
	assert.equal(page.findCellIndexByKey('😀') !== null, true);

	const cells = activeCells(page);
	assert.equal(cells.length, 3);
	assert.equal(page.header.cellCount, 3);
	assert.ok(page.rawData.some((byte) => byte !== 0));
	assert.equal(new Cell('é', 'x').length(), 3);
	assert.equal(new Cell('😀', '🙂').length(), 8);
});

test('compaction removes fragmentation and preserves data', () => {
	const page = new Page();

	page.insert('a', '1');
	page.insert('b', '22');
	page.insert('c', '333');
	assert.equal(page.delete('b'), true);
	assert.equal(page.availabilityFreeList.length, 1);

	const freed = page.compact();
	assert.ok(freed > 0);
	assert.equal(page.availabilityFreeList.length, 0);
	assert.equal(page.header.cellCount, 2);
	assert.equal(page.findCellIndexByKey('a') !== null, true);
	assert.equal(page.findCellIndexByKey('c') !== null, true);
});

test('reset increments page id and clears data', () => {
	const page = new Page();

	page.insert('a', '1');
	page.reset();
	assert.equal(page.header.pageId, 1);
	assert.equal(page.header.cellCount, 0);
	assert.equal(page.cellOffset.length, 0);
	assert.equal(page.availabilityFreeList.length, 0);
	page.reset();
	assert.equal(page.header.pageId, 2);
});

test('page fills until it runs out of room', () => {
	const page = new Page();
	let inserts = 0;

	assert.throws(() => {
		while (true) {
			page.insert(`k${inserts}`, 'v');
			inserts += 1;
		}
	}, /Not enough space to insert the cell/);
	assert.ok(inserts > 0);
	assert.equal(page.header.cellCount, inserts);
});
