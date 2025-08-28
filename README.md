# CA DMV Plate Finder

A script that finds available custom license plates through the California DMV's online system.

## Prerequisites

- [Bun](https://bun.sh/)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/CA-DMV-Plate-Finder.git
cd CA-DMV-Plate-Finder
```

2. Install dependencies:

```bash
bun install
```

## Usage

### Running the Application

```bash
bun run find-plates
```

Or directly:

```bash
bun src/index.ts
```

### Configuration

Edit `src/config.ts` to adjust:

- `NUM_PARALLEL`: Number of concurrent workers (default: 10)
- API endpoints and headers (pre-configured for DMV system)

### Customizing Plate Input

The application supports two methods for providing plates to check:

#### Method 1: Using a plates.txt File (Recommended)

Create a `plates.txt` file in the project root with one plate per line:

```
ABC123
TESLA1
GITHUB
CODING
```

The application will automatically detect and stream plates from this file.

#### Method 2: Generating Combinations

If no `plates.txt` file exists, the application will generate 3-character combinations. You can modify the `getNextPlate()` generator in `src/index.ts` to customize the generation pattern:

```typescript
import { combinationsWithReplacement } from "combinatorial-generators";

async function* getNextPlate(): AsyncGenerator<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  for (const combo of combinationsWithReplacement(chars, 3)) {
    yield combo.join("");
  }
}
```
