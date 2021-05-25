/**
 * @template T
 * @template U
 * @param {T[]} array
 * @param {U} value
 * @param {((item: T) => U)?} key
 * @returns {number} index
 */
export function binarySearch(array, value, key = null) {
    if (key === null) {
        key = item => item;
    }

    let le = 0;
    let gt = array.length;

    while (1 < gt - le) {
        const mid = le + Math.floor((gt - le) / 2);
        if (key(array[mid]) <= value) {
            le = mid;
        } else {
            gt = mid;
        }
    }

    return le;
}
