// SPDX-License-Identifier: MIT

/**
dependencies:
flint 2.9.0 https://flintlib.org/doc/index.html
used functions documented here:
fmpz.h https://flintlib.org/doc/fmpz.html
fmpz_mod.h https://flintlib.org/doc/fmpz_mod.html

compile:
g++ vdf_pietrzak.cpp -lgmp -lflint -std=gnu++17

run:
./a.out $difficulty $input_val
**/

#include <iostream>

#include <flint/fmpz.h>
#include <flint/fmpz_mod.h>

#include "keccak/Keccak256.cpp"

using namespace std;

// converter from string characters to uint8 hex values
const uint8_t charmap[] =
  {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //  !"#$%&'
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ()*+,-./
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, // 01234567
    0x08, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 89:;<=>?
    0x00, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x00, // @ABCDEFG
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // HIJKLMNO
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // PQRSTUVW
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // XYZ[\]^_
    0x00, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x00, // `abcdefg
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // hijklmno
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // pqrstuvw
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // xyz{|}~.
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00  // ........
  };
// converter from hex to string characters
const char hex_dict[] = "0123456789ABCDEF"; 

// 32 bytes
const size_t HASH_SIZE = Keccak256::HASH_LEN;
const size_t UINT256_SIZE = 32;
const size_t MODULUS_SIZE = 256;
const int HEX_BASE = 16;

// converts the val from raw bytes to string representing bytes and writes it to str
// val_len is a number of bytes, the outputted string will be twice as long
// preserves big endian representation
void convert_to_hex_str(char* str, uint8_t* val, size_t val_len) {
  // cerr << "convert_to_hex_str" << endl;
	for (size_t i = 0; i < val_len; i++)
	{
		str[(i * 2) + 0] = hex_dict[((val[i] & 0xF0) >> 4)];
		str[(i * 2) + 1] = hex_dict[((val[i] & 0x0F) >> 0)];
	}
}

// debugging function to display byte arrays as strings
void print_bytes(uint8_t* val, size_t val_len) {
  cerr << "print_bytes" << endl;
  char printString[2*val_len + 1];
  printString[2*val_len] = '\0';

  convert_to_hex_str(printString, val, val_len);
  
  cerr << "value as string " << printString << endl;
}

// function for converting a fmpz object into a byte array
// fmpz only outputs and inputs from strings for big numbers
// the fmpz val is converted and written to valbytes
// type_width is the maximum possible bytes the fmpz is expected to hold
// the byte array must have length type_width and will be fully padded
// representation is big endian
void fmpz_to_uint8(uint8_t* valbytes, fmpz_t val, size_t type_width) {
  // cerr << "fmpz_to_uint8" << endl;
  // cerr << "val:" << endl;
  // fmpz_print(val);
  // cerr << endl;

  // gives the length of the hexstring of the number
  size_t valsize = fmpz_sizeinbase(val, HEX_BASE);
  // cerr << "valsize = " << valsize << endl;

  // write to the string, minding the null terminator
  char valchars [valsize+1];
  fmpz_get_str(valchars, HEX_BASE, val);

  // need to consider whole bytes (2 characters per byte)
  // cerr << valsize << endl;
  bool valsizeOdd = false;
  if((valsize & 1) == 1) { valsizeOdd = true; };
 
  // cerr << valchars << endl;

  // now that we have the string representation of the number, we have to convert to bytes
  // i runs over the string array, but we grab two characters at a time
  for(size_t i = 0; i < valsize-1; i+=2) {
    valbytes[type_width - i/2 - 1] = charmap[valchars[valsize - i - 1]] | charmap[valchars[valsize - i - 2]]<<4;
    // cerr << (int)valbytes[type_width - i/2 - 1] << ",";
  }
  if(valsizeOdd) {
    valsize++;
    valbytes[type_width - valsize/2] = charmap[valchars[0]];
  }
  // since fmpz doesn't give leading zeros, we need to pad up to the type width
  for(size_t i = valsize; i < 2*type_width; i+=2) {
    valbytes[type_width - i/2 - 1] = 0x00;
  }
  // cerr << endl;
}

// function for getting the exponent at each iteration
// exponent is the output, fmpz is used because the value can be large enough to require it
// t is the difficulty, will be the same for the whole loop
// i is the iteration in the solution loop
// sqrt_flag is an additional flag to precompute the exponent based on if we're calculating u or usqrt
void get_exponent(fmpz_t exponent, long t, long i, long sqrt_flag) {
  // cerr << "get_exponent" << endl;

  // this will store the intermediate exponent
  // cerr << "calc tau" << endl;
  fmpz_t tau;
  fmpz_init(tau);
  // start with 2
  fmpz_set_ui(tau, 2);
  // set to 2^(t - i)
  fmpz_pow_ui(tau, tau, t - i);
  // cerr << "tau:" << endl;
  // fmpz_print(tau);
  // cerr << endl;

  // base is 2, we are doing squarings
  // cerr << "reset exp" << endl;
  fmpz_set_ui(exponent, 2);
  // cerr << "exponent:" << endl;
  // fmpz_print(exponent);
  // cerr << endl;

  // set exponent as 2 ^ (tau - sqrt_flag)
  // where sqrt_flag is expected to be either zero or one, based on if we want the square root or not
  // cerr << "calc exponent" << endl;
  fmpz_sub_ui(tau, tau, sqrt_flag);
  int success = fmpz_pow_fmpz(exponent, exponent, tau);
  // zero is returned on failure
  // cerr << success << endl;
  // raw throw here is fine as this script is run externally
  if(success == 0) {cerr << "fmpz_pow_fmpz failure" << endl;throw;}
}

// this function solves the vdf
// y and usqrts are output values and are assumed blank, with usqrts having t-1 slots
// x and t are required inputs
// see documentation here for more context https://github.com/helix-foundation/currency/blob/master/contracts/VDF/README.md 
void evaluate(fmpz_t y, fmpz_t *usqrts, fmpz_t x, long t) {
  // cerr << "evaluate" << endl;

  // setup the modulus for the VDF
  // modulus is RSA-2048 from the factoring challenge https://en.wikipedia.org/wiki/RSA_Factoring_Challenge
  // cerr << "set N" << endl;
  fmpz_t N;
  fmpz_init(N);
  fmpz_set_str(N, "c7970ceedcc3b0754490201a7aa613cd73911081c790f5f1a8726f463550bb5b7ff0db8e1ea1189ec72f93d1650011bd721aeeacc2acde32a04107f0648c2813a31f5b0b7765ff8b44b4b6ffc93384b646eb09c7cf5e8592d40ea33c80039f35b4f14a04b51f7bfd781be4d1673164ba8eb991c2c4d730bbbe35f592bdef524af7e8daefd26c66fc02c479af89d64d373f442709439de66ceb955f3ea37d5159f6135809f85334b5cb1813addc80cd05609f10ac6a95ad65872c909525bdad32bc729592642920f24c61dc5b3c3b7923e56b16a4d9d373d8721f24a3fc0f1b3131f55615172866bccc30f95054c824e733a5eb6817f7bc16399d48c6361cc7e5", HEX_BASE);
  // cerr << "N:" << endl;
  // fmpz_print(N);
  // cerr << endl;

  // modulo context for mod multiplication
  // cerr << "set ctx" << endl;
  fmpz_mod_ctx_t ctx;
  fmpz_mod_ctx_init(ctx, N);

  // initialize loop variables for the calculation
  fmpz_t ui, ui2, r, xir, ur, e, xi, yi;

  // running var to form the proof array
  fmpz_init(ui);
  // var for calculating xi and yi each loop
  fmpz_init(ui2);
  // the hash value
  fmpz_init(r);
  // intermediate value xi ^ r mod N
  fmpz_init(xir);
  // intermediate value u ^ r mod N
  fmpz_init(ur);

  // exponent for mod squaring
  fmpz_init(e);
  // exponent for calculating y, exponent = 2 ^ (2 ^ t)
  get_exponent(e, t, 0, 0);
  // cerr << "e:" << endl;
  // fmpz_print(e);
  // cerr << endl;

  // running value xi for the calculation
  fmpz_init(xi);
  // initiate xi = x^2 mod N
  fmpz_powm_ui(xi, x, 2, N);

  // y = (x ^ 2) ^ (2 ^ (2 ^ t)) is one of the output vars
  // cerr << "calculating y" << endl;
  fmpz_powm(y, xi, e, N);
  // cerr << "y calculated" << endl;

  // running value yi during the calculation
  fmpz_init(yi);
  // yi starts at y
  fmpz_set(yi, y);

  // convert x to bytes, padded to the size of uint256 bytewidth
  uint8_t xbytes [UINT256_SIZE];
  fmpz_to_uint8(xbytes, x, UINT256_SIZE);

  // convert y to bytes, padded to the size of the modulus bytewidth
  uint8_t ybytes [MODULUS_SIZE];
  fmpz_to_uint8(ybytes, y, MODULUS_SIZE);
  // print_bytes(ybytes, MODULUS_SIZE);

  // xypacked combines x and y
  size_t xysize = UINT256_SIZE + MODULUS_SIZE;
  uint8_t xypacked [xysize];
  // cerr << xysize << endl;

  // copy data into packed array
  copy(xbytes, xbytes + UINT256_SIZE, xypacked);
  // print_bytes(xypacked, xysize);

  copy(ybytes, ybytes + MODULUS_SIZE, xypacked + UINT256_SIZE);
  // print_bytes(xypacked, xysize);

  // xyhash holdes the hashed value for reuse later in the calculation
  // cerr << "hashing xy" << endl;
  uint8_t xyhash [HASH_SIZE];
  Keccak256::getHash(xypacked,xysize,xyhash);
  // print_bytes(xyhash, HASH_SIZE);

  // loop from 1 to t - 1 to form the elements of the proof
  for(long i = 1; i < t; i++) {
    // cerr << "in loop" << endl;
  
    // exponent for calculating ui is 2 ^ ( 2 ^ (t - i) - 1 )
    get_exponent(e, t, i, 1);
  
    // ui = xi ^ e mod N where e is calculated above
    // cerr << "calc ui" << endl;
    fmpz_powm(ui, xi, e, N);
    // cerr << fmpz_get_str(NULL, HEX_BASE, ui) << endl;

    // set ui in the proof array
    // cerr << "save ui" << endl;
    fmpz_set(usqrts[i-1], ui);
    // cerr << fmpz_get_str(NULL, HEX_BASE, usqrts[i-1]) << endl;

    // calculate u = ui ^ 2 mod N
    // cerr << "calc ui2" << endl;
    fmpz_powm_ui(ui2, ui, 2, N);

    // rhash holdes the hashed value, rstring holds the string for passing to flint
    uint8_t rhash [HASH_SIZE];
    // rstring is used for converting back to fmpz
    // each byte takes up two characters
    char rstring [HASH_SIZE*2 + 1];
    // mind the null terminator
    rstring[HASH_SIZE*2] = '\0';

    // convert ui to bytes, padded to the size of the modulus bytewidth
    uint8_t uibytes [MODULUS_SIZE];
    fmpz_to_uint8(uibytes, ui, MODULUS_SIZE);

    // convert i to bytes, padded to the size of uint256 bytewidth
    uint8_t ibytes [UINT256_SIZE];
    // we can safely assume that i fits in a single byte (less than 256)
    ibytes[UINT256_SIZE-1] = (uint8_t)i;
    // pad the rest of the array
    for(size_t j = 0; j < UINT256_SIZE - 1; j++) {
      ibytes[j] = 0x00;
    }

    // cerr << "calc r" << endl;

    // rhash combines the previously calculated xyhash with ui and i
    size_t r_input_size = HASH_SIZE + MODULUS_SIZE + UINT256_SIZE;
    uint8_t r_input_packed [r_input_size];

    // copy data into packed array
    copy(xyhash, xyhash + HASH_SIZE, r_input_packed);
    // print_bytes(r_input_packed, r_input_size);
    copy(uibytes, uibytes + MODULUS_SIZE, r_input_packed + HASH_SIZE);
    // print_bytes(r_input_packed, r_input_size);
    copy(ibytes, ibytes + UINT256_SIZE, r_input_packed + HASH_SIZE + MODULUS_SIZE);
    // print_bytes(r_input_packed, r_input_size);

    // hash the packed data
    Keccak256::getHash(r_input_packed,r_input_size,rhash);
    // print_bytes(rhash, HASH_SIZE);

    // convert to string for fmpz's sake
    convert_to_hex_str(rstring, rhash, HASH_SIZE);

    // set r to the hash value
    fmpz_set_str(r, rstring, HEX_BASE);

    // the next xi for the loop x{i+1} = xi^r * u
    fmpz_powm(xir, xi, r, N);
    fmpz_mod_mul(xi, xir, ui2, ctx);

    // the next yi for the loop y{i+1} = u^r * yi
    fmpz_powm(ur, ui2, r, N);
    fmpz_mod_mul(yi, ur, yi, ctx);
  }
  // cerr << "end loop" << endl;
}

int main(int argc, char* argv[]) {
  // cerr << "******************************************************************" << endl;
  // cerr << "start" << endl;

  // first arg is t, the number of iterations
  long t = stol(argv[1]);
  // cerr << "t = " << t << endl;

  // second arg is x, the starting position of the vdf
  fmpz_t x;
  fmpz_set_str(x, argv[2], HEX_BASE);
  // cerr << "x (as int):" << endl;
  // fmpz_print(x);
  // cerr << endl;

  // initialize the pointers for the output values
  fmpz_t y;
  fmpz_t usqrts [t-1];
  // evaluates the vdf
  evaluate(y, usqrts, x, t);

  // pipe y and proof vals to the output
	std::cout << fmpz_get_str(NULL, HEX_BASE, y) << endl;
  for (size_t i = 0; i<t-1; i++) {
    std::cout << fmpz_get_str(NULL, HEX_BASE, usqrts[i]) << endl;
  }
}
