# Copyright (c) OpenAI. All rights reserved.
import argparse
import os
from math import ceil, sqrt

from PIL import Image


def create_montage(input_files: list[str], output_path: str, max_size: int = 2048) -> None:
    images = [Image.open(img_path) for img_path in input_files]
    num_images = len(images)

    grid_size = ceil(sqrt(num_images))
    img_width, img_height = images[0].size

    # Create grid
    grid_width = grid_size * img_width
    grid_height = grid_size * img_height

    # Create new image with transparent background & place images in grid
    grid_image = Image.new("RGBA", (grid_width, grid_height), (255, 255, 255, 0))
    for idx, img in enumerate(images):
        x = (idx % grid_size) * img_width
        y = (idx // grid_size) * img_height
        grid_image.paste(img, (x, y))

    max_dimension = max(grid_width, grid_height)
    if max_dimension > max_size:
        scale = max_size / max_dimension
        new_width = int(grid_width * scale)
        new_height = int(grid_height * scale)
        grid_image = grid_image.resize((new_width, new_height), Image.Resampling.LANCZOS)

    grid_image.save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a montage from input images.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--input_files", nargs="+", help="List of input image file paths")
    group.add_argument("--input_dir", help="Directory containing input images")
    parser.add_argument("--output", required=True, help="Path to save the output montage")
    parser.add_argument(
        "--max_size",
        type=int,
        default=2048,
        help="Maximum size for the longest side of the output image (default: 2048)",
    )

    args = parser.parse_args()

    # Handle input files
    if args.input_files:
        input_files = args.input_files
    else:
        # Get all PNG files from directory
        input_files = [
            os.path.join(args.input_dir, f)
            for f in sorted(os.listdir(args.input_dir))
            if f.lower().endswith(".png")
        ]
        if not input_files:
            raise ValueError("No PNG files found in the specified directory.")

    create_montage(input_files, args.output, args.max_size)


if __name__ == "__main__":
    main()
