use crate::fragment::Fragment;

// RLP data type tags
pub global STRING: u32 = 0;
pub global LIST: u32 = 1;

// Max bytes to represent entity length (supports up to 2^16 - 1).
global MAX_LEN_IN_BYTES: u32 = 2;

// Describes the location and type of a decoded RLP element.
pub struct RlpFragment {
    pub offset: u32,
    pub length: u32,
    pub data_type: u32,
}

impl Default for RlpFragment {
    fn default() -> Self {
        RlpFragment { offset: 0, length: 0, data_type: 0 }
    }
}

impl Eq for RlpFragment {
    fn eq(self, other: Self) -> bool {
        (self.offset == other.offset) & (self.length == other.length) & (self.data_type == other.data_type)
    }
}

// Decoded RLP header: offset to payload, payload length, and data type.
pub struct RlpHeader {
    pub offset: u32,
    pub length: u32,
    pub data_type: u32,
}

// Read a multi-byte length from the front of `data` (big-endian, up to 2 bytes).
fn extract_payload_len<let N: u32>(data: Fragment<N>, lenlen: u32) -> u32 {
    assert(lenlen <= MAX_LEN_IN_BYTES, "Length of length exceeds maximum");
    assert(lenlen <= data.length, "Length of length exceeds input length");
    assert(lenlen != 0, "Length of length is zero");

    let mut payload_length: u32 = 0;
    for i in 0..2 {
        if (i < lenlen) & (i < data.length) {
            payload_length = data.at(i) as u32 + payload_length * 256;
        }
    }
    payload_length
}

// Decode the RLP header (first byte + optional length bytes).
pub fn decode_to_rlp_header<let N: u32>(data: Fragment<N>) -> RlpHeader {
    let mut data = data;
    let prefix = data.pop_front();

    if prefix < 0x80 {
        // Single byte (0x00..0x7f)
        RlpHeader { offset: 0, length: 1, data_type: STRING }
    } else if prefix < 0xb8 {
        // Short string (0..55 bytes)
        let length = (prefix - 0x80) as u32;
        assert(1 + length <= N, "Short string length exceeds input");
        RlpHeader { offset: 1, length, data_type: STRING }
    } else if prefix < 0xc0 {
        // Long string (> 55 bytes)
        let lenlen = (prefix - 0xb7) as u32;
        let offset = (prefix - 0xb6) as u32; // 1 + lenlen
        let length = extract_payload_len(data, lenlen);
        assert(offset + length <= N, "Long string length exceeds input");
        RlpHeader { offset, length, data_type: STRING }
    } else if prefix < 0xf8 {
        // Short list (0..55 bytes)
        let length = (prefix - 0xc0) as u32;
        assert(1 + length <= N, "Short list length exceeds input");
        RlpHeader { offset: 1, length, data_type: LIST }
    } else {
        // Long list (> 55 bytes)
        let lenlen = (prefix - 0xf7) as u32;
        let offset = (prefix - 0xf6) as u32; // 1 + lenlen
        let length = extract_payload_len(data, lenlen);
        assert(offset + length <= N, "Long list length exceeds input");
        RlpHeader { offset, length, data_type: LIST }
    }
}

// Offset and length for a small string element (prefix < 0xb8).
fn get_small_string_offset_and_length(first_byte: u8) -> (u32, u32) {
    assert(first_byte < 0xb8, "Element is not a small string");
    if first_byte < 0x80 {
        (0, 1)
    } else {
        (1, (first_byte - 0x80) as u32)
    }
}

// Decode an RLP list whose elements are all small strings (<= 55 bytes each).
pub fn decode_list_of_small_strings<let N: u32, let NUM_FIELDS: u32>(
    data: Fragment<N>,
) -> BoundedVec<RlpFragment, NUM_FIELDS> {
    let mut rlp_list: BoundedVec<RlpFragment, NUM_FIELDS> = BoundedVec::new();

    let RlpHeader { offset, length, data_type } = decode_to_rlp_header(data);
    assert(data_type == LIST, "Expected a list");

    let total_len = offset + length;
    assert(total_len <= data.length, "Total length exceeds input length");

    let mut current_offset = offset;
    for _i in 0..NUM_FIELDS {
        if current_offset < total_len {
            let first_byte = data.at(current_offset);
            let (field_off, field_len) = get_small_string_offset_and_length(first_byte);
            rlp_list.push(RlpFragment {
                offset: current_offset + field_off,
                length: field_len,
                data_type: STRING,
            });
            current_offset += field_off + field_len;
        }
    }
    assert(current_offset == total_len, "Inconsistent RLP length");
    rlp_list
}

// Decode a general RLP list (elements can be strings or nested lists).
pub fn decode_list<let N: u32, let MAX_FIELDS: u32>(
    data: Fragment<N>,
) -> BoundedVec<RlpFragment, MAX_FIELDS> {
    let mut rlp_list: BoundedVec<RlpFragment, MAX_FIELDS> = BoundedVec::new();

    let RlpHeader { offset, length, data_type } = decode_to_rlp_header(data);
    assert(data_type == LIST, "Expected a list");

    let total_len = offset + length;
    assert(total_len <= data.length, "Total length exceeds input length");

    let mut current_offset = offset;
    for _i in 0..MAX_FIELDS {
        if current_offset < total_len {
            let header_frag: Fragment<N> =
                data.subfragment(current_offset, data.length - current_offset);
            let RlpHeader { offset: field_off, length: field_len, data_type: field_type } =
                decode_to_rlp_header(header_frag);

            let mut el_offset = current_offset;
            let mut el_length = field_len;
            if field_type == STRING {
                el_offset += field_off;
            } else {
                el_length += field_off;
            }
            rlp_list.push(RlpFragment {
                offset: el_offset,
                length: el_length,
                data_type: field_type,
            });
            current_offset += field_off + field_len;
        }
    }
    assert(current_offset == total_len, "Inconsistent RLP length");
    rlp_list
}

// -- Tests --

#[test]
fn test_decode_single_byte() {
    let mut data: [u8; 4] = [0; 4];
    data[0] = 0x42;
    let header = decode_to_rlp_header(Fragment::from_array(data));
    assert(header.offset == 0);
    assert(header.length == 1);
    assert(header.data_type == STRING);
}

#[test]
fn test_decode_short_string() {
    let mut data: [u8; 8] = [0; 8];
    data[0] = 0x83; // 3-byte string
    data[1] = 0x41;
    data[2] = 0x42;
    data[3] = 0x43;
    let header = decode_to_rlp_header(Fragment::from_array(data));
    assert(header.offset == 1);
    assert(header.length == 3);
    assert(header.data_type == STRING);
}

#[test]
fn test_decode_empty_string() {
    let mut data: [u8; 4] = [0; 4];
    data[0] = 0x80;
    let header = decode_to_rlp_header(Fragment::from_array(data));
    assert(header.offset == 1);
    assert(header.length == 0);
    assert(header.data_type == STRING);
}

#[test]
fn test_decode_short_list() {
    // [0x01, 0x02] => 0xC2, 0x01, 0x02
    let mut data: [u8; 8] = [0; 8];
    data[0] = 0xC2;
    data[1] = 0x01;
    data[2] = 0x02;
    let list: BoundedVec<RlpFragment, 4> =
        decode_list_of_small_strings(Fragment::from_array(data));
    assert(list.len() == 2);
    assert(list.get(0).offset == 1);
    assert(list.get(0).length == 1);
    assert(list.get(1).offset == 2);
    assert(list.get(1).length == 1);
}

#[test]
fn test_decode_list_with_string_elements() {
    // [empty, 0x03E8] => 0xC4, 0x80, 0x82, 0x03, 0xE8
    let mut data: [u8; 8] = [0; 8];
    data[0] = 0xC4;
    data[1] = 0x80;
    data[2] = 0x82;
    data[3] = 0x03;
    data[4] = 0xE8;
    let list: BoundedVec<RlpFragment, 4> =
        decode_list_of_small_strings(Fragment::from_array(data));
    assert(list.len() == 2);
    // empty string: offset past the 0x80 prefix, length 0
    assert(list.get(0).offset == 2);
    assert(list.get(0).length == 0);
    // 2-byte string at offset 3
    assert(list.get(1).offset == 3);
    assert(list.get(1).length == 2);
}
