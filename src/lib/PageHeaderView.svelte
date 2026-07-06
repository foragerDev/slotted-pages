
<script lang='ts'>
    import { PageHeader } from '$lib/index';
    let {header} = $props<{header: PageHeader}>();
</script>

<div class="m-1">
    <table class="table-auto border-collapse border border-gray-300">
    <tbody>
        <tr class="text-xs">
            <td><strong>Page ID:</strong></td>
            <td>{header.pageId}</td>
        </tr>
        <tr class="text-xs">
            <td><strong>Magic String:</strong></td>
            <td>{header.magicString}</td>
        </tr>
        <tr class="text-xs">    
            <td><strong>Cell Count:</strong></td>
            <td>{header.cellCount}</td>
        </tr>
        <tr class="text-xs">
            <td><strong>Free Space End:</strong></td>
            <td>{header.freeSpaceEnd}</td>
        </tr>
        </tbody>
    </table>
</div>