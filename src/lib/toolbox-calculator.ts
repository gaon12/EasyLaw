import type { McpToolCallResult } from "./mcp-client";

export const calculatorInputSchema = {
  properties: {
    expression: {
      description: "계산할 수식. 숫자, +, -, *, /, %, ^, 괄호를 지원합니다.",
      maxLength: 300,
      type: "string",
    },
  },
  required: ["expression"],
  type: "object",
} as const;

export function calculateExpression(
  args: Record<string, unknown>,
): McpToolCallResult {
  const expression =
    typeof args.expression === "string" ? args.expression.trim() : "";
  if (!expression) {
    return toolError("expression이 필요합니다.");
  }
  if (expression.length > 300) {
    return toolError("expression은 300자 이내여야 합니다.");
  }

  try {
    const result = new ExpressionParser(expression).parse();
    const structuredContent = { expression, result };
    return {
      content: [{ text: JSON.stringify(structuredContent), type: "text" }],
      isError: false,
      structuredContent,
    };
  } catch (error) {
    return toolError(
      error instanceof Error ? error.message : "계산에 실패했습니다.",
    );
  }
}

class ExpressionParser {
  private index = 0;

  constructor(private readonly expression: string) {}

  parse() {
    const value = this.parseAdditive();
    this.skipWhitespace();
    if (this.index !== this.expression.length) {
      throw new Error(
        `지원하지 않는 토큰입니다: ${this.expression[this.index]}`,
      );
    }
    if (!Number.isFinite(value)) {
      throw new Error("계산 결과가 유효한 숫자가 아닙니다.");
    }
    return Number(value.toPrecision(15));
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    for (;;) {
      this.skipWhitespace();
      if (this.consume("+")) {
        value += this.parseMultiplicative();
      } else if (this.consume("-")) {
        value -= this.parseMultiplicative();
      } else {
        return value;
      }
    }
  }

  private parseMultiplicative(): number {
    let value = this.parsePower();
    for (;;) {
      this.skipWhitespace();
      if (this.consume("*")) {
        value *= this.parsePower();
      } else if (this.consume("/")) {
        const divisor = this.parsePower();
        if (divisor === 0) {
          throw new Error("0으로 나눌 수 없습니다.");
        }
        value /= divisor;
      } else if (this.consume("%")) {
        const divisor = this.parsePower();
        if (divisor === 0) {
          throw new Error("0으로 나눌 수 없습니다.");
        }
        value %= divisor;
      } else {
        return value;
      }
    }
  }

  private parsePower(): number {
    const base = this.parseUnary();
    this.skipWhitespace();
    return this.consume("^") ? base ** this.parsePower() : base;
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.consume("+")) {
      return this.parseUnary();
    }
    return this.consume("-") ? -this.parseUnary() : this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();
    if (!this.consume("(")) {
      return this.parseNumber();
    }
    const value = this.parseAdditive();
    this.skipWhitespace();
    if (!this.consume(")")) {
      throw new Error("닫는 괄호가 필요합니다.");
    }
    return value;
  }

  private parseNumber(): number {
    this.skipWhitespace();
    const start = this.index;
    while (/[0-9.]/.test(this.expression[this.index] ?? "")) {
      this.index += 1;
    }
    if (start === this.index) {
      throw new Error("숫자가 필요합니다.");
    }
    const raw = this.expression.slice(start, this.index);
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(raw)) {
      throw new Error(`숫자 형식이 올바르지 않습니다: ${raw}`);
    }
    return Number(raw);
  }

  private consume(token: string) {
    if (this.expression[this.index] !== token) {
      return false;
    }
    this.index += token.length;
    return true;
  }

  private skipWhitespace() {
    while (/\s/.test(this.expression[this.index] ?? "")) {
      this.index += 1;
    }
  }
}

function toolError(message: string): McpToolCallResult {
  return {
    content: [{ text: message, type: "text" }],
    isError: true,
  };
}
