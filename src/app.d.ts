import type { AdminContext } from '$lib/server/auth';
import type { Member } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			/** Current admin elevation, or null in standard mode. */
			admin: AdminContext | null;
			/** The family member currently "operating" the dashboard on this device, if chosen. */
			operator: Member | null;
			setupComplete: boolean;
		}
		interface PageData {
			admin?: { name: string; email: string } | null;
			operator?: {
				id: string;
				name: string;
				emoji: string;
				color: string;
				hasAvatar?: boolean;
			} | null;
		}
	}
}

export {};
