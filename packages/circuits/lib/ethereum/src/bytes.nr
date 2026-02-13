use crate::fragment::Fragment;

// Split a byte into its upper and lower nibbles.
pub fn byte_to_nibbles(byte: u8) -> (u8, u8) {
    let upper = byte / 16;
    let lower = byte - 16 * upper;
    (upper, lower)
}

// Convert a byte fragment to a nibble fragment (each byte becomes 2 nibbles).
// N must be >= 2 * bytes.length.
pub fn bytes_to_nibbles<let N: u32>(bytes: Fragment<N>) -> Fragment<N> {
    assert(N >= 2 * bytes.length, "Backing array must be >= 2x byte length for nibbles");

    let mut nibbles_data: [u8; N] = [0; N];
    for i in 0..N {
        if i < bytes.length {
            let byte = bytes.at(i);
            let (hi, lo) = byte_to_nibbles(byte);
            nibbles_data[2 * i] = hi;
            nibbles_data[2 * i + 1] = lo;
        }
    }
    Fragment { offset: 0, length: 2 * bytes.length, data: nibbles_data }
}

// Strip leading zero bytes and left-shift the data.
// Returns (shifted_data, actual_length).
pub fn right_pad<let N: u32>(arr: [u8; N]) -> ([u8; N], u32) {
    // Find the first non-zero byte.
    let mut first_nonzero: u32 = N;
    let mut found = false;
    for i in 0..N {
        if !found & (arr[i] != 0) {
            first_nonzero = i;
            found = true;
        }
    }
    let value_length = if found { N - first_nonzero } else { 0 };

    // Left-shift to remove leading zeros.
    let mut result: [u8; N] = [0; N];
    for i in 0..N {
        if i < value_length {
            result[i] = arr[first_nonzero + i];
        }
    }
    (result, value_length)
}
