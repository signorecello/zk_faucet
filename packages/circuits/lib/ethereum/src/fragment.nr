use crate::arrays::memcpy_up_to_length;

// A view into a fixed-size u8 array with offset and length.
pub struct Fragment<let N: u32> {
    pub offset: u32,
    pub length: u32,
    pub data: [u8; N],
}

impl<let N: u32> Fragment<N> {
    pub fn empty() -> Fragment<N> {
        Fragment { offset: 0, length: 0, data: [0; N] }
    }

    pub fn from_array(data: [u8; N]) -> Fragment<N> {
        Fragment { offset: 0, length: N, data }
    }

    pub fn new(offset: u32, length: u32, data: [u8; N]) -> Fragment<N> {
        assert(offset + length <= N, "Fragment bounds exceed data length");
        Fragment { offset, length, data }
    }

    pub fn new_with_length(length: u32, data: [u8; N]) -> Fragment<N> {
        assert(length <= N, "Fragment length exceeds data length");
        Fragment { offset: 0, length, data }
    }

    pub fn at(self, index: u32) -> u8 {
        assert(index < self.length, "Fragment index out of bounds");
        self.data[self.offset + index]
    }

    pub fn set(&mut self, index: u32, value: u8) {
        assert(index < self.length, "Fragment index out of bounds");
        self.data[self.offset + index] = value;
    }

    pub fn pop_front(&mut self) -> u8 {
        assert(self.length > 0, "Cannot pop from empty fragment");
        let value = self.data[self.offset];
        self.offset += 1;
        self.length -= 1;
        value
    }

    pub fn subfragment(self, offset: u32, length: u32) -> Fragment<N> {
        assert(offset + length <= self.length, "Subfragment overflows fragment");
        Fragment { offset: self.offset + offset, length, data: self.data }
    }

    // Copy the active region into a new fragment with a different backing size.
    pub fn focus<let M: u32>(self) -> Fragment<M> {
        assert(M >= self.length, "New max length smaller than fragment length");
        let mut new_data: [u8; M] = [0; M];
        memcpy_up_to_length(&mut new_data, self.data, self.offset, self.length);
        Fragment { offset: 0, length: self.length, data: new_data }
    }

    pub fn is_empty(self) -> bool {
        self.length == 0
    }

    // Compare contents with a fragment of potentially different backing size.
    pub fn eq_fragment<let M: u32>(self, other: Fragment<M>) -> bool {
        if self.length != other.length {
            false
        } else {
            let mut result = true;
            for i in 0..N {
                if i < self.length {
                    result &= self.at(i) == other.at(i);
                }
            }
            result
        }
    }
}

impl<let N: u32> Eq for Fragment<N> {
    fn eq(self, other: Fragment<N>) -> bool {
        self.eq_fragment(other)
    }
}
