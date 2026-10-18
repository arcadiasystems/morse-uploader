import { SuiGrpcClient } from "@mysten/sui/grpc";
import { walrus } from "@mysten/walrus";
import { NETWORKS, type NetworkId } from "./networks";

/**
 * A Sui gRPC client for one network, extended with the Walrus client. Public
 * JSON-RPC is gone from Sui full nodes, so every read goes over gRPC.
 */
export function createNetworkClient(network: NetworkId) {
	return new SuiGrpcClient({
		network,
		baseUrl: NETWORKS[network].grpcUrl,
	}).$extend(walrus());
}

export type NetworkClient = ReturnType<typeof createNetworkClient>;
