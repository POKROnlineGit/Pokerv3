// Universal PokerCodec (Node.js + Browser compatible)
// Uses Uint8Array, DataView, TextEncoder/Decoder instead of Node Buffer

/**
 * Action type enum
 * @enum {number}
 */
export const ActionType = {
  FOLD: 1,
  CHECK: 2,
  CALL: 3,
  BET_OR_RAISE: 4,
  WIN_POT: 5,
  SHOW_CARDS: 6,
  POST_SMALL_BLIND: 7,
  POST_BIG_BLIND: 8,
  POST_ANTE: 9,
  NEXT_STREET: 10, // Marker for street transitions
};

// --- Card Utilities ---

export function cardToIndex(card) {
  if (typeof card === "string") {
    const rankChar = card[0].toUpperCase();
    const suitChar = card[1].toLowerCase();
    const rankMap = {
      2: 0,
      3: 1,
      4: 2,
      5: 3,
      6: 4,
      7: 5,
      8: 6,
      9: 7,
      T: 8,
      J: 9,
      Q: 10,
      K: 11,
      A: 12,
    };
    const suitMap = { h: 0, d: 1, c: 2, s: 3 };
    return suitMap[suitChar] * 13 + rankMap[rankChar];
  }
  const suitMap = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
  const rankMap = {
    2: 0,
    3: 1,
    4: 2,
    5: 3,
    6: 4,
    7: 5,
    8: 6,
    9: 7,
    T: 8,
    J: 9,
    Q: 10,
    K: 11,
    A: 12,
  };
  return (
    suitMap[card.suit.toLowerCase()] * 13 + rankMap[card.rank.toUpperCase()]
  );
}

export function indexToCard(index) {
  const suit = Math.floor(index / 13);
  const rank = index % 13;
  const suitChars = ["h", "d", "c", "s"];
  const rankChars = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "T",
    "J",
    "Q",
    "K",
    "A",
  ];
  return `${rankChars[rank]}${suitChars[suit]}`;
}

// --- The Codec ---

export class PokerCodec {
  static VERSION = 0x01;
  static NULL_CARD = 0xff;
  static MAX_PLAYERS = 10;
  static BOARD_SIZE = 5;
  static MAX_ACTION_COUNT = 65535;
  static MAX_HOLE_CARDS = 255;

  /**
   * Helper: Parse Hex String to Uint8Array (Browser safe)
   * Handles Postgres '\x' prefix automatically
   */
  static fromHex(hexString) {
    if (!hexString) return new Uint8Array();
    if (hexString.startsWith("\\x")) hexString = hexString.substring(2);
    const match = hexString.match(/.{1,2}/g);
    if (!match) return new Uint8Array();
    return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
  }

  /**
   * Helper: Concatenate Uint8Arrays
   */
  static _concat(arrays) {
    let totalLength = 0;
    for (const arr of arrays) totalLength += arr.length;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  static validateCardIndex(card, allowNull = true) {
    if (allowNull && card === this.NULL_CARD) return;
    if (card < 0 || card > 51) throw new Error(`Invalid card index: ${card}`);
  }

  static encode(data) {
    let maxHoleCards = data.maxHoleCards;
    if (!maxHoleCards) {
      maxHoleCards = 0;
      for (const hand of data.holeCards)
        maxHoleCards = Math.max(maxHoleCards, hand.length);
      if (maxHoleCards === 0) maxHoleCards = 2;
    }

    // Derive playerCount from startingStacks or holeCards
    const playerCount =
      data.startingStacks?.length || data.holeCards?.length || 0;
    if (playerCount === 0) {
      throw new Error(
        "Cannot encode: playerCount is 0 (no startingStacks or holeCards)"
      );
    }

    const chunks = [];
    const encoder = new TextEncoder();

    // 1. Header (3 bytes: version, maxHoleCards, playerCount)
    const header = new Uint8Array(3);
    header[0] = this.VERSION;
    header[1] = maxHoleCards;
    header[2] = playerCount;
    chunks.push(header);

    // 2. Starting Stacks (playerCount × 4 bytes, uint32LE each)
    if (data.startingStacks && data.startingStacks.length > 0) {
      if (data.startingStacks.length !== playerCount) {
        throw new Error(
          `Starting stacks length (${data.startingStacks.length}) does not match playerCount (${playerCount})`
        );
      }
      const stacksBuf = new Uint8Array(playerCount * 4);
      const stacksView = new DataView(stacksBuf.buffer);
      for (let i = 0; i < playerCount; i++) {
        const stack = data.startingStacks[i];
        if (stack < 0 || stack > 0xffffffff) {
          throw new Error(
            `Invalid stack amount: ${stack} (must be 0-4294967295)`
          );
        }
        stacksView.setUint32(i * 4, stack, true);
      }
      chunks.push(stacksBuf);
    } else {
      // If no starting stacks provided, write zeros (for backward compatibility during transition)
      const stacksBuf = new Uint8Array(playerCount * 4);
      chunks.push(stacksBuf);
    }

    // 3. Board
    const boardBuf = new Uint8Array(this.BOARD_SIZE);
    for (let i = 0; i < this.BOARD_SIZE; i++) {
      const card = data.board[i] !== undefined ? data.board[i] : this.NULL_CARD;
      this.validateCardIndex(card, true);
      boardBuf[i] = card;
    }
    chunks.push(boardBuf);

    // 4. Hole Cards
    for (let i = 0; i < playerCount; i++) {
      const handBuf = new Uint8Array(maxHoleCards);
      const hand = data.holeCards[i];
      for (let j = 0; j < maxHoleCards; j++) {
        const card = hand[j] !== undefined ? hand[j] : this.NULL_CARD;
        this.validateCardIndex(card, true);
        handBuf[j] = card;
      }
      chunks.push(handBuf);
    }

    // 5. Action Count
    const countBuf = new Uint8Array(2);
    new DataView(countBuf.buffer).setUint16(0, data.actions.length, true);
    chunks.push(countBuf);

    // 6. Actions
    for (const action of data.actions) {
      const isMonetary = [3, 4, 5, 7, 8, 9].includes(action.type);
      const requiresCards = action.type === 6;
      const hasPotIndex = action.type === 5 && action.potIndex !== undefined;
      const hasDeltaTime = action.deltaTime !== undefined;
      const hasStreet = action.type === 10 && action.street !== undefined;

      let size = 3;
      if (isMonetary) size += 4;
      if (requiresCards) size += 1 + action.cards.length;
      if (hasPotIndex) size += 1;
      if (hasDeltaTime) size += 2;

      let streetBytes = null;
      if (hasStreet) {
        streetBytes = encoder.encode(action.street);
        size += 1 + streetBytes.length;
      }

      const buf = new Uint8Array(size);
      const view = new DataView(buf.buffer);
      let offset = 0;

      buf[offset++] = action.seatIndex;
      buf[offset++] = action.type;

      let flags = 0;
      if (isMonetary) flags |= 0x01;
      if (requiresCards) flags |= 0x02;
      if (hasPotIndex) flags |= 0x04;
      if (hasDeltaTime) flags |= 0x08;
      if (hasStreet) flags |= 0x10;
      buf[offset++] = flags;

      if (isMonetary) {
        view.setUint32(offset, action.amount, true);
        offset += 4;
      }
      if (requiresCards) {
        buf[offset++] = action.cards.length;
        for (const c of action.cards) buf[offset++] = c;
      }
      if (hasPotIndex) {
        buf[offset++] = action.potIndex;
      }
      if (hasDeltaTime) {
        view.setUint16(offset, action.deltaTime, true);
        offset += 2;
      }
      if (hasStreet) {
        buf[offset++] = streetBytes.length;
        buf.set(streetBytes, offset);
        offset += streetBytes.length;
      }
      chunks.push(buf);
    }

    return this._concat(chunks);
  }

  static decode(buffer) {
    if (!(buffer instanceof Uint8Array))
      throw new Error("buffer must be a Uint8Array");

    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    const decoder = new TextDecoder();
    let offset = 0;

    const version = view.getUint8(offset++);
    if (version !== this.VERSION) {
      throw new Error(
        `Version mismatch: expected ${this.VERSION}, got ${version}`
      );
    }
    const maxHoleCards = view.getUint8(offset++);
    const playerCount = view.getUint8(offset++);

    // 2. Starting Stacks (playerCount × 4 bytes, uint32LE each)
    const startingStacks = [];
    for (let i = 0; i < playerCount; i++) {
      const stack = view.getUint32(offset, true);
      offset += 4;
      startingStacks.push(stack);
    }

    const board = [];
    for (let i = 0; i < this.BOARD_SIZE; i++) {
      const card = view.getUint8(offset++);
      if (card !== this.NULL_CARD) board.push(card);
    }

    const holeCards = [];
    for (let i = 0; i < playerCount; i++) {
      const hand = [];
      for (let j = 0; j < maxHoleCards; j++) {
        const card = view.getUint8(offset++);
        if (card !== this.NULL_CARD) hand.push(card);
      }
      holeCards.push(hand);
    }

    const actionCount = view.getUint16(offset, true);
    offset += 2;

    const actions = [];
    for (let i = 0; i < actionCount; i++) {
      const seatIndex = view.getUint8(offset++);
      const type = view.getUint8(offset++);
      const flags = view.getUint8(offset++);

      let amount, cards, potIndex, deltaTime, street;

      if (flags & 0x01) {
        amount = view.getUint32(offset, true);
        offset += 4;
      }
      if (flags & 0x02) {
        const count = view.getUint8(offset++);
        cards = [];
        for (let j = 0; j < count; j++) cards.push(view.getUint8(offset++));
      }
      if (flags & 0x04) {
        potIndex = view.getUint8(offset++);
      }
      if (flags & 0x08) {
        deltaTime = view.getUint16(offset, true);
        offset += 2;
      }
      if (flags & 0x10) {
        const len = view.getUint8(offset++);
        street = decoder.decode(buffer.subarray(offset, offset + len));
        offset += len;
      }

      actions.push({
        seatIndex,
        type,
        amount,
        cards,
        potIndex,
        deltaTime,
        street,
      });
    }

    return { board, holeCards, actions, maxHoleCards, startingStacks };
  }
}
