export interface ApiResponse<T> { readonly success: boolean; readonly data: T; readonly message?: string; }
