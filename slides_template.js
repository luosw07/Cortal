// Copyright (c) OpenAI. All rights reserved.
const path = require("path");
const fs = require("fs");
const { imageSize } = require("image-size");
const pptxgen = require("pptxgenjs");
const { icon } = require("@fortawesome/fontawesome-svg-core");
const { faHammer } = require("@fortawesome/free-solid-svg-icons");
/*
 * Table of Contents:
Slide 1: Title slide with subtitle and date
Slide 2: Stacked column chart with key takeaways
Slide 3: Three side-by-side image blocks with captions
Slide 4: Three key points stacked vertically
Slide 5: Timeline with chevron steps and category table
Slide 6: Competitor analysis bubble graph
Slide 7: Horizontal timeline with categories and events
 */
const SLIDE_HEIGHT = 5.625; // inches
const SLIDE_WIDTH = (SLIDE_HEIGHT / 9) * 16; // 10 inches
const BULLET_INDENT = 15; // USE THIS FOR BULLET INDENTATION SPACINGS. Example: {text: "Lorem ipsum dolor sit amet.",options: { bullet: { indent: BULLET_INDENT } },},
const FONT_FACE = "Arial";
const FONT_SIZE = {
  PRESENTATION_TITLE: 36,
  PRESENTATION_SUBTITLE: 12,
  SLIDE_TITLE: 24,
  DATE: 12,
  SECTION_TITLE: 16,
  TEXT: 12,
  DETAIL: 8,
  PLACEHOLDER: 10,
  CITATION: 6,
  SUBHEADER: 21,
};
const CITATION_HEIGHT = calcTextBoxHeight(FONT_SIZE.CITATION);
const MARGINS = {
  DEFAULT_PADDING_BOTTOM: 0.23,
  DEFAULT_CITATION: SLIDE_HEIGHT - CITATION_HEIGHT - 0.15,
  ELEMENT_MEDIUM_PADDING_MEDIUM: 0.3,
  ELEMENT_MEDIUM_PADDING_LARGE: 0.6,
};
const SLIDE_TITLE = { X: 0.3, Y: 0.3, W: "94%" };
const WHITE = "FFFFFF"; // FOR BACKGROUND, adapt as needed for a light theme.
const BLACK = "000000"; // ONLY FOR FONTS, ICONS, ETC, adapt as needed for a light theme
const NEAR_BLACK_NAVY = "030A18"; // ONLY FOR FONTS, ICONS, ETC, adapt as needed for a light theme
const LIGHT_GRAY = "f5f5f5";
// Just a placeholder! If you see slide using this, you'll need to replace it with actual assets—either generated or sourced from the internet.
const PLACEHOLDER_LIGHT_GRAY_BLOCK = path.join(
  __dirname,
  "placeholder_light_gray_block.png"
);
const imageInfoCache = new Map();
function calcTextBoxHeight(fontSize, lines = 1, leading = 1.2, padding = 0.15) {
  const lineHeightIn = (fontSize / 72) * leading;
  return lines * lineHeightIn + padding;
}
function getImageDimensions(path) {
  if (imageInfoCache.has(path)) return imageInfoCache.get(path);
  const dimensions = imageSize(fs.readFileSync(path));
  imageInfoCache.set(path, {
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: dimensions.width / dimensions.height,
  });
  return imageInfoCache.get(path);
}
function imageSizingContain(path, x, y, w, h) {
  // path: local file path; x, y, w, h: viewport inches
  const { aspectRatio } = getImageDimensions(path),
    boxAspect = w / h;
  const w2 = aspectRatio >= boxAspect ? w : h * aspectRatio,
    h2 = aspectRatio >= boxAspect ? w2 / aspectRatio : h;
  return { x: x + (w - w2) / 2, y: y + (h - h2) / 2, w: w2, h: h2 };
}
function imageSizingCrop(path, x, y, w, h) {
  // path: local file path; x, y, w, h: viewport inches
  const { aspectRatio } = getImageDimensions(path),
    boxAspect = w / h;
  let cx, cy, cw, ch;
  if (aspectRatio >= boxAspect) {
    cw = boxAspect / aspectRatio;
    ch = 1;
    cx = (1 - cw) / 2;
    cy = 0;
  } else {
    cw = 1;
    ch = aspectRatio / boxAspect;
    cx = 0;
    cy = (1 - ch) / 2;
  }
  let virtualW = w / cw,
    virtualH = virtualW / aspectRatio,
    eps = 1e-6;
  if (Math.abs(virtualH * ch - h) > eps) {
    virtualH = h / ch;
    virtualW = virtualH * aspectRatio;
  }
  return {
    x,
    y,
    w: virtualW,
    h: virtualH,
    sizing: { type: "crop", x: cx * virtualW, y: cy * virtualH, w, h },
  };
}
const hSlideTitle = calcTextBoxHeight(FONT_SIZE.SLIDE_TITLE);
function addSlideTitle(slide, title, color = BLACK) {
  slide.addText(title, {
    x: SLIDE_TITLE.X,
    y: SLIDE_TITLE.Y,
    w: SLIDE_TITLE.W,
    h: hSlideTitle,
    fontFace: FONT_FACE,
    fontSize: FONT_SIZE.SLIDE_TITLE,
    color,
  });
}
function getIconSvg(faIcon, color) {
  // CSS color, syntax slightly different from pptxgenjs.
  return icon(faIcon, { styles: { color: `#${color}` } }).html.join("");
}
const svgToDataUri = (svg) =>
  "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
(async () => {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "16x9", width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
  pptx.layout = "16x9";
  // Slide 1: Title slide with subtitle and date. IMPORTANT: You should look at all slides below to get a good overview of the deck.
  {
    const slide = pptx.addSlide();
    slide.addImage({
      path: PLACEHOLDER_LIGHT_GRAY_BLOCK,
      ...imageSizingCrop(
        PLACEHOLDER_LIGHT_GRAY_BLOCK,
        0.55 * SLIDE_WIDTH,
        0.1 * SLIDE_HEIGHT,
        0.45 * SLIDE_WIDTH,
        0.8 * SLIDE_HEIGHT
      ),
    });
    const leftMargin = 0.3;
    const hTitle = calcTextBoxHeight(FONT_SIZE.PRESENTATION_TITLE);
    slide.addText("Presentation title", {
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.PRESENTATION_TITLE,
      x: leftMargin,
      y: (SLIDE_HEIGHT - hTitle) / 2,
      w: "50%",
      h: calcTextBoxHeight(FONT_SIZE.PRESENTATION_TITLE),
      valign: "middle",
    });
    slide.addText("Subtitle here", {
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.PRESENTATION_SUBTITLE,
      x: leftMargin,
      y: 3.15,
      w: "50%",
      h: calcTextBoxHeight(FONT_SIZE.PRESENTATION_SUBTITLE),
    });
    let hDate = calcTextBoxHeight(FONT_SIZE.DATE);
    slide.addText("Date here", {
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.DATE,
      x: leftMargin,
      y: SLIDE_HEIGHT - 0.375 - hDate,
      w: 3.75,
      h: hDate,
    });
  }
  // Slide 2: Stacked column chart with key takeaways. IMPORTANT: THERE ARE MANY MORE diverse slides below, LOOK AT ALL OF THEM.
  {
    const slide = pptx.addSlide();
    slide.addShape(pptx.ShapeType.rect, {
      fill: {
        color: LIGHT_GRAY,
      },
      x: "65%",
      y: 0,
      w: "35%",
      h: "100%",
    });
    addSlideTitle(slide, "Slide title");
    const ySectionTitle = SLIDE_TITLE.Y + hSlideTitle + 0.3;
    const hSectionTitle = calcTextBoxHeight(FONT_SIZE.SECTION_TITLE);
    const yContent = ySectionTitle + hSectionTitle + 0.23;
    const labels = ["Jan", "Feb", "Mar", "Apr"];
    const dataChart = [
      { name: "Core SaaS", labels, values: [5.2, 5.5, 6.1, 6.4] },
      { name: "Add-ons", labels, values: [1.8, 2.0, 2.5, 2.7] },
      { name: "Services", labels, values: [1.0, 1.1, 1.4, 1.6] },
    ];
    slide.addText("Plot Title (units, unit scale)", {
      x: 0.3,
      y: ySectionTitle,
      w: "58%",
      h: hSectionTitle,
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.TEXT,
    });
    slide.addChart(pptx.ChartType.bar, dataChart, {
      x: SLIDE_TITLE.X,
      y: yContent + 0.4, // Make up for the bottom margin introduced for the category axis title.
      w: "58%",
      h: 3,
      barDir: "col",
      barGrouping: "stacked",
      chartColors: ["002B5B", "1F6BBA", "9CC3E4"],
      showValue: true,
      dataLabelPosition: "ctr",
      dataLabelColor: "DDDDDD",
      catAxisMajorTickMark: "none",
      valAxisMajorTickMark: "none",
      valAxisLineShow: false,
      valGridLine: { color: "EEEEEE" },
      showLegend: true,
      legendPos: "tr",
      legendFontFace: FONT_FACE,
      legendFontSize: FONT_SIZE.DETAIL,
      layout: { x: 0.1, y: 0.1, w: 0.7, h: 0.6 }, // relative margin of the plot within the chart area.
      showValAxisTitle: true,
      showCatAxisTitle: true,
    });
    const xRight = "67%";
    slide.addText("Takeaways", {
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.SECTION_TITLE,
      x: xRight,
      y: ySectionTitle,
      w: 3,
      h: hSectionTitle,
    });
    slide.addText(
      [
        {
          text: "Lorem ipsum dolor.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
        {
          text: "Nullam pharetra.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
        {
          text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
        {
          text: "Nullam pharetra mauris tortor. In hac habitasse platea dictumst.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
      ],
      {
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.TEXT,
        x: xRight,
        y: ySectionTitle,
        w: "29%",
        h: calcTextBoxHeight(FONT_SIZE.TEXT, 14),
        paraSpaceAfter: FONT_SIZE.TEXT * 0.3,
      }
    );
    slide.addText(
      [
        {
          text: "[1]",
          options: {
            hyperlink: {
              url: "【17†L999-L1001】", // replace with real target
            },
            color: NEAR_BLACK_NAVY,
          },
        },
      ],
      {
        x: SLIDE_TITLE.X,
        y: MARGINS.DEFAULT_CITATION,
        w: SLIDE_TITLE.W,
        h: CITATION_HEIGHT,
        fontSize: FONT_SIZE.CITATION,
      }
    );
  }
  // Slide 3: Three side-by-side image blocks with captions. IMPORTANT: You should look at all slides below to get a good overview of the deck.
  {
    const slide = pptx.addSlide();
    addSlideTitle(slide, "Slide title");
    // Three images with captions
    const LEFT_MARGIN = SLIDE_WIDTH * 0.05;
    const GAP = 0.05 * SLIDE_WIDTH;
    const IMAGE_W = (SLIDE_WIDTH - LEFT_MARGIN * 2 - GAP * 2) / 3; // Ensure horizontal alignment.
    const IMAGE_H = 0.5 * SLIDE_HEIGHT;
    const images = [
      PLACEHOLDER_LIGHT_GRAY_BLOCK,
      PLACEHOLDER_LIGHT_GRAY_BLOCK,
      PLACEHOLDER_LIGHT_GRAY_BLOCK,
    ];
    const IMAGE_Y = (SLIDE_HEIGHT - IMAGE_H) / 2;
    const CAPTION_Y = IMAGE_Y + IMAGE_H + 0.2;
    const xPos = [
      `${LEFT_MARGIN}`,
      `${LEFT_MARGIN + IMAGE_W + GAP}`,
      `${LEFT_MARGIN + 2 * (IMAGE_W + GAP)}`,
    ];
    const captions = [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque quam ut massa luctus cursus.",
      "Nullam pharetra mauris tortor. In hac habitasse platea dictumst. Proin mattis nibh risus. In hac habitasse platea dictumst.",
      "Nulla tempor ut massa elementum dapibus. Nam non ante quis enim fringilla tempus nec in lectus.",
    ];

    xPos.forEach((x, i) => {
      slide.addImage({
        path: images[i],
        ...imageSizingCrop(images[i], x, IMAGE_Y, IMAGE_W, IMAGE_H),
      });
      slide.addText(captions[i], {
        x,
        y: CAPTION_Y,
        w: IMAGE_W,
        h: calcTextBoxHeight(13, 4),
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.TEXT,
        valign: "top",
      });
    });
  }
  // Slide 4: Three key points stacked vertically. IMPORTANT: You should look at all slides below to get a good overview of the deck.
  {
    const slide = pptx.addSlide();
    addSlideTitle(slide, "Slide title");
    // Numbered text blocks
    const NUMBER = { X: "40%", W: 0.675 };
    const CONTENT = { X: "45%", W: "50%" };
    const TITLE_TEXT_GAP = 0.015;
    const BLOCK_GAP = 0.45;
    let y = SLIDE_TITLE.Y + 0.15;
    const items = [
      {
        num: "01",
        title: "Title for item number one…",
        text: "Lorem ipsum dolor sit amet",
        numLines: 1,
      },
      {
        num: "02",
        title: "Title for item number one…",
        text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
        numLines: 1,
      },
      {
        num: "03",
        title: "Title for item number one…",
        text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque ultricies quam ut massa luctus cursus. Nullam pharetra mauris tortor. In hac habitasse platea dictumst. Proin mattis nibh risus. Nulla tempor ut massa elementum dapibus. Nam non ante quis enim fringilla tempus nec in lectus. In hac habitasse platea dictumst.",
        numLines: 5,
      },
    ];
    items.forEach(({ num, title, text, numLines }) => {
      slide.addText(num, {
        x: NUMBER.X,
        y,
        w: NUMBER.W,
        h: calcTextBoxHeight(FONT_SIZE.SECTION_TITLE),
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.SECTION_TITLE,
      });

      const hTitle = calcTextBoxHeight(FONT_SIZE.SECTION_TITLE);
      slide.addText(title, {
        x: CONTENT.X,
        y,
        w: CONTENT.W,
        h: hTitle,
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.SECTION_TITLE,
      });

      const hBody = calcTextBoxHeight(FONT_SIZE.TEXT, numLines);
      slide.addText(text, {
        x: CONTENT.X,
        y: y + hTitle + TITLE_TEXT_GAP,
        w: CONTENT.W,
        h: hBody,
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.TEXT,
      });
      y += hTitle + TITLE_TEXT_GAP + hBody + BLOCK_GAP;
    });
  }
  // Slide 5: Timeline with chevron steps and category table. IMPORTANT: You should look at all slides below to get a good overview of the deck.
  {
    const slide = pptx.addSlide();

    addSlideTitle(slide, "Timeline or Phases");

    // Geometry & positioning constants
    const STEP_TITLES = [
      "Step title 1",
      "Step title 2",
      "Step title 3",
      "Step title 4",
    ];
    const STEP_W = 1.95; // matches table-column width
    const STEP_H = 0.42; // a little sleeker
    const CAT_COL_W = 1.3; // width of the Category column
    const LEFT_MARGIN = 0.3; // overall slide margin
    const ARROW_Y = SLIDE_TITLE.Y + 0.825;
    const TABLE_X = LEFT_MARGIN;
    const TABLE_Y = ARROW_Y + STEP_H + 0.2;
    const COL_W = [CAT_COL_W, STEP_W, STEP_W, STEP_W, STEP_W];

    // Arrow bar
    STEP_TITLES.forEach((label, i) => {
      slide.addText(label, {
        shape: pptx.ShapeType.chevron,
        x: TABLE_X + CAT_COL_W + i * STEP_W,
        y: ARROW_Y,
        w: STEP_W,
        h: STEP_H,
        fill: { color: "F2F2F2" },
        line: { color: "F2F2F2" },
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.TEXT,
        align: "center",
        valign: "middle",
      });
    });

    // Bullet helper
    const bullet = (txt) => ({
      text: txt,
      options: {
        bullet: { indent: BULLET_INDENT },
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.TEXT,
      },
    });

    // Content table
    const longB =
      "Nullam pharetra mauris tortor. In hac habitasse platea dictumst.";

    const rows = [
      [
        {
          text: "Category 1",
          options: { fontFace: FONT_FACE, fontSize: FONT_SIZE.SECTION_TITLE },
        },
        {
          text: [
            bullet(
              "Pellentesque ultricies quam ut. Lorem ipsum dolor sit amet, consectetur adipiscing elit."
            ),
          ],
        },
        { text: [bullet("Nullam pharetra mauris tortor.")] },
        { text: [bullet("Pellentesque ultricies quam ut.")] },
        {
          text: [bullet("Lorem ipsum dolor sit amet. "), bullet(longB)],
        },
      ],
      [
        {
          text: "Category 2",
          options: { fontFace: FONT_FACE, fontSize: FONT_SIZE.SECTION_TITLE },
        },
        {
          text: [bullet("Pellentesque ultricies quam ut.")],
        },
        {
          text: [
            bullet("Lorem ipsum dolor sit amet, consectetur."),
            bullet("Pellentesque ultricies quam ut."),
          ],
        },
        {
          text: [
            bullet("Lorem ipsum dolor sit amet, consectetur."),
            bullet("Pellentesque ultricies quam ut."),
          ],
        },
        {
          text: [
            bullet("Lorem ipsum dolor sit amet, consectetur."),
            bullet("Pellentesque ultricies quam ut."),
          ],
        },
      ],
    ];

    slide.addTable(rows, {
      x: TABLE_X,
      y: TABLE_Y,
      colW: COL_W,
      rowH: 1.5,
      valign: "top",
      border: [
        { type: "none" },
        { type: "none" },
        { type: "none" },
        { type: "none" },
      ],
    });
  }
  // Slide 6: Competitor analysis bubble graph. IMPORTANT: You should look at all slides below to get a good overview of the deck.
  {
    const slide = pptx.addSlide();

    slide.addShape(pptx.ShapeType.rect, {
      fill: {
        color: LIGHT_GRAY,
      },
      x: "65%",
      y: 0,
      w: "35%",
      h: "100%",
    });

    addSlideTitle(slide, "Slide title");

    const haxisLength =
      SLIDE_WIDTH * 0.65 - MARGINS.ELEMENT_MEDIUM_PADDING_LARGE * 2;
    slide.addText("Visualization Title", {
      x: 0.5,
      y: 1.2,
      w: haxisLength,
      h: calcTextBoxHeight(FONT_SIZE.SECTION_TITLE),
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.SECTION_TITLE,
      color: NEAR_BLACK_NAVY,
    });

    const axisCenterX = (SLIDE_WIDTH * 0.65) / 2;
    const axisCenterY = SLIDE_HEIGHT / 2 + 0.2;
    const axisLength = SLIDE_HEIGHT * 0.55;

    slide.addShape("line", {
      x: axisCenterX,
      y: axisCenterY / 2,
      w: 0,
      h: axisLength,
      line: { color: NEAR_BLACK_NAVY, width: 1 },
    });

    slide.addShape("line", {
      x: axisCenterX - haxisLength / 2,
      y: axisCenterY,
      w: haxisLength,
      h: 0,
      line: { color: NEAR_BLACK_NAVY, width: 1 },
    });

    slide.addText("PLACEHOLDER X-Axis title", {
      x: axisCenterX - haxisLength / 2,
      y: axisCenterY + axisLength / 2 + MARGINS.ELEMENT_MEDIUM_PADDING_MEDIUM,
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.DETAIL,
      color: NEAR_BLACK_NAVY,
      h: calcTextBoxHeight(FONT_SIZE.DETAIL),
      align: "center",
      w: haxisLength,
    });

    const yAxisTextBoxLength = SLIDE_HEIGHT / 2;
    slide.addText("PLACEHOLDER Y-Axis title", {
      x: -(yAxisTextBoxLength / 2) + SLIDE_TITLE.X,
      y: SLIDE_HEIGHT / 2 + 0.2,
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.DETAIL,
      color: NEAR_BLACK_NAVY,
      rotate: 270,
      w: yAxisTextBoxLength,
      h: calcTextBoxHeight(FONT_SIZE.DETAIL),
      align: "center",
    });

    const circleDiameter = 0.75;
    const circles = [
      { label: "Item 1", x: axisCenterX - 1.2, y: axisCenterY - 1.2 },
      { label: "Item 2", x: axisCenterX + 0.6, y: axisCenterY - 0.9 },
      { label: "Item 3", x: axisCenterX - 1.5, y: axisCenterY + 0.525 },
      { label: "Item 4", x: axisCenterX + 0.9, y: axisCenterY + 0.375 },
    ];

    circles.forEach((c) => {
      slide.addShape("ellipse", {
        x: c.x,
        y: c.y,
        w: circleDiameter,
        h: circleDiameter,
        fill: { color: "0B3556" }, // dark blue
        line: { color: "0B3556" },
      });

      const hDetail = calcTextBoxHeight(FONT_SIZE.DETAIL);
      slide.addText(c.label, {
        x: c.x,
        y: c.y + (circleDiameter - hDetail) / 2,
        w: circleDiameter,
        h: hDetail,
        align: "center",
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.DETAIL,
        color: WHITE,
      });
    });

    const ySectionTitle = SLIDE_TITLE.Y + hSlideTitle + 0.3;
    const hSectionTitle = calcTextBoxHeight(FONT_SIZE.SECTION_TITLE);
    const yContent = ySectionTitle + hSectionTitle + 0.23;
    const xRight = "67%";
    slide.addText("Takeaways", {
      fontFace: FONT_FACE,
      fontSize: FONT_SIZE.SECTION_TITLE,
      x: xRight,
      y: ySectionTitle,
      w: 3,
      h: hSectionTitle,
    });

    slide.addText(
      [
        {
          text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque ultricies quam ut.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
        {
          text: "Nullam pharetra mauris tortor. In hac habitasse platea dictumst.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
        {
          text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque ultricies quam ut.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
        {
          text: "Nullam pharetra mauris tortor. In hac habitasse platea dictumst.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
        {
          text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque ultricies quam ut.",
          options: { bullet: { indent: BULLET_INDENT } },
        },
      ],
      {
        fontFace: FONT_FACE,
        fontSize: FONT_SIZE.TEXT,
        x: xRight,
        y: yContent,
        w: "29%",
        h: calcTextBoxHeight(FONT_SIZE.TEXT, 14),
        paraSpaceAfter: FONT_SIZE.TEXT * 0.3,
      }
    );
  }
  // Slide 7: Horizontal timeline with categories and events. IMPORTANT: You should look at all slides below to get a good overview of the deck.
  {
    const slide = pptx.addSlide();
    addSlideTitle(slide, "Slide title");

    // timeline horizontal line
    const lineY = 0.22 * SLIDE_HEIGHT;
    const COLOR_LINE_GRAY = "888888";
    slide.addShape("line", {
      x: "10%",
      y: lineY,
      w: "83%",
      h: "0.1%",
      line: { color: COLOR_LINE_GRAY, width: 2 },
    });

    // Add timeline dots and labels
    const COLOR_TIMELINE_DOT = "666666";
    const colCount = 4;
    const colWidth = 0.22 * SLIDE_WIDTH;
    const dotDiameter = 0.075;
    const dotOffset = 2 * dotDiameter;
    const verticalLineHeight = 0.044 * SLIDE_HEIGHT;
    const dateY = 0.16 * SLIDE_HEIGHT;

    for (let i = 0; i < colCount; i++) {
      const x = 1.2 + i * colWidth;
      // Date label
      slide.addText("Date", {
        x: x,
        y: dateY,
        w: "20%",
        h: "5.3%",
        fontSize: FONT_SIZE.PLACEHOLDER,
        fontFace: FONT_FACE,
      });
      // Dot on the line
      slide.addShape("ellipse", {
        x: x + dotOffset,
        y: lineY - dotDiameter / 2,
        w: dotDiameter,
        h: dotDiameter,
        fill: { color: COLOR_TIMELINE_DOT },
        line: { color: COLOR_TIMELINE_DOT },
      });

      // Vertical line from dot to header
      slide.addShape("line", {
        x: x + dotOffset + dotDiameter / 2, // center of the dot
        y: lineY + dotDiameter / 2, // bottom of the dot
        w: 0,
        h: verticalLineHeight, // vertical height to header
        line: { color: COLOR_LINE_GRAY, width: 2 },
      });
    }

    const categories = ["Category 1", "Category 2"];
    const headers = ["Header 1", "Header 2", "Header 3", "Header 4"];
    const texts = [
      [
        [
          {
            text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque ultricies quam ut.",
          },
        ],
        [
          {
            text: "Nullam pharetra mauris tortor. In hac habitasse platea dictumst.",
          },
        ],
        [
          {
            text: "Pellentesque ultricies quam ut. Nullam pharetra mauris tortor.",
          },
          { text: "In hac habitasse platea." },
        ],
      ],
      [
        [
          {
            text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque ultricies quam ut. Ultricies quam ut.",
          },
        ],
        [
          {
            text: "Lorem ipsum dolor sit amet, elit. Nullam pharetra mauris tortor.",
          },
        ],
        [
          {
            text: "Pellentesque ultricies quam ut. In hac habitasse platea.\n\nLorem ipsum dolor sit amet, consectetur elit.",
          },
        ],
        [
          {
            text: "Lorem ipsum dolor sit amet, consectetur. Pellen tesque ultricies quam ut.",
          },
        ],
      ],
    ];

    const headerOffset = 0.293 * SLIDE_HEIGHT;
    const rowHeight = 0.284 * SLIDE_HEIGHT;
    const categoryHeightOffset = 0.06 * SLIDE_HEIGHT;
    categories.forEach((cat, rowIndex) => {
      slide.addText(cat, {
        x: 0.1,
        y: headerOffset + categoryHeightOffset + rowIndex * rowHeight,
        w: 1.05,
        h: calcTextBoxHeight(FONT_SIZE.TEXT),
        fontSize: FONT_SIZE.TEXT,
        fontFace: FONT_FACE,
        valign: "top",
        align: "left",
      });

      for (let colIndex = 0; colIndex < colCount; colIndex++) {
        const x = 1.2 + colIndex * colWidth;
        const y = headerOffset + rowIndex * rowHeight;

        if (rowIndex === 0) {
          slide.addText(headers[colIndex], {
            x: x,
            y: y,
            w: colWidth - 0.2,
            h: 0.3,
            fontSize: FONT_SIZE.PLACEHOLDER,
            fontFace: FONT_FACE,
          });
        }

        slide.addText(texts[rowIndex][colIndex], {
          x: x,
          y: y + 0.3,
          w: colWidth - 0.2,
          h: 1.3,
          fontSize: FONT_SIZE.PLACEHOLDER,
          fontFace: FONT_FACE,
          lineSpacingMultiple: 1.0,
          valign: "top",
          align: "left",
        });
      }
    });
  }
  await pptx.writeFile({ fileName: "slides_template.pptx" });
})();
