import { bcs } from "@mysten/sui/bcs";

/**
 * BCS layouts of the Walrus Move types the Walrus pane reads, from
 * `blob.move`, `storage_resource.move` and `metadata.move`
 * (PROTOCOL-NOTES section 7). `@mysten/walrus` has the same structs but does
 * not export them.
 */
const StorageBcs = bcs.struct("Storage", {
	id: bcs.Address,
	start_epoch: bcs.u32(),
	end_epoch: bcs.u32(),
	storage_size: bcs.u64(),
});

export const BlobBcs = bcs.struct("Blob", {
	id: bcs.Address,
	registered_epoch: bcs.u32(),
	blob_id: bcs.u256(),
	size: bcs.u64(),
	encoding_type: bcs.u8(),
	certified_epoch: bcs.option(bcs.u32()),
	storage: StorageBcs,
	deletable: bcs.bool(),
});

/** `dynamic_field::Field<vector<u8>, metadata::Metadata>`: a blob's attributes. */
export const MetadataFieldBcs = bcs.struct("Field", {
	id: bcs.Address,
	name: bcs.vector(bcs.u8()),
	value: bcs.struct("Metadata", {
		metadata: bcs.struct("VecMap", {
			contents: bcs.vector(
				bcs.struct("Entry", { key: bcs.string(), value: bcs.string() }),
			),
		}),
	}),
});

/** The dynamic field name that holds a blob's attributes: `b"metadata"`, as a `vector<u8>`. */
export const METADATA_FIELD_NAME = {
	type: "vector<u8>",
	bcs: bcs
		.vector(bcs.u8())
		.serialize(new TextEncoder().encode("metadata"))
		.toBytes(),
} as const;
