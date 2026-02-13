// Copy `length` bytes from src[offset..] into dest[0..].
pub fn memcpy_up_to_length<let DEST_LEN: u32, let SRC_LEN: u32>(
    dest: &mut [u8; DEST_LEN],
    src: [u8; SRC_LEN],
    offset: u32,
    length: u32,
) {
    assert(length <= DEST_LEN, "Destination index out of bound");
    assert(offset + length <= SRC_LEN, "Source index out of bound");
    for i in 0..DEST_LEN {
        if i < length {
            (*dest)[i] = src[offset + i];
        }
    }
}

// Check if subarray[0..length] == array[offset..offset+length].
pub fn sub_array_equals_up_to_length<let SUBARRAY_LEN: u32, let ARRAY_LEN: u32>(
    subarray: [u8; SUBARRAY_LEN],
    array: [u8; ARRAY_LEN],
    offset: u32,
    length: u32,
) -> bool {
    assert(length <= SUBARRAY_LEN, "Subarray index out of bound");
    assert(offset + length <= ARRAY_LEN, "Array index out of bound");
    let mut result = true;
    for i in 0..SUBARRAY_LEN {
        if i < length {
            result &= subarray[i] == array[offset + i];
        }
    }
    result
}
