import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/restaurant_reports.dart';
import '../theme/bhojpatra_theme.dart';
import '../utils/utils.dart';

class MetricGrid extends StatelessWidget {
  const MetricGrid({super.key, required this.values});
  final List<(String, String, IconData, Color)> values;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) => GridView.count(
      crossAxisCount: c.maxWidth >= 700 ? 4 : 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: c.maxWidth >= 700 ? 2.2 : 1.8,
      children: [
        for (final v in values)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(v.$3, size: 16, color: v.$4),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          v.$1,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            color: Brand.muted,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      v.$2,
                      style: const TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w900,
                        color: Brand.navy,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}

class ReportPanel extends StatelessWidget {
  const ReportPanel({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
  });
  final String title;
  final String? subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                subtitle!,
                style: const TextStyle(fontSize: 11, color: Brand.muted),
              ),
            ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    ),
  );
}

class InteractiveBars extends StatefulWidget {
  const InteractiveBars({
    super.key,
    required this.values,
    this.currency = true,
    this.color = Brand.orange,
    this.onSelect,
    this.limit = 12,
  });
  final List<ReportValue> values;
  final bool currency;
  final Color color;
  final int limit;
  final ValueChanged<ReportValue>? onSelect;
  @override
  State<InteractiveBars> createState() => _InteractiveBarsState();
}

class _InteractiveBarsState extends State<InteractiveBars> {
  String? selected;
  @override
  Widget build(BuildContext context) {
    if (widget.values.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(18),
        child: Text(
          'No records in this period',
          textAlign: TextAlign.center,
          style: TextStyle(color: Brand.muted),
        ),
      );
    }
    final max = widget.values.fold<num>(1, (a, v) => math.max(a, v.value));
    return Column(
      children: [
        for (final v in widget.values.take(widget.limit))
          Semantics(
            button: true,
            label:
                '${v.label}: ${widget.currency ? money(v.value.round()) : v.value}',
            child: InkWell(
              onTap: () {
                setState(() => selected = v.label);
                widget.onSelect?.call(v);
              },
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            v.label.replaceAll('_', ' '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          widget.currency
                              ? money(v.value.round())
                              : '${v.value}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    TweenAnimationBuilder<double>(
                      key: ValueKey('${v.label}-${v.value}'),
                      tween: Tween(
                        begin: 0,
                        end: (v.value / max).toDouble().clamp(0, 1),
                      ),
                      duration: const Duration(milliseconds: 500),
                      builder: (context, value, _) => Container(
                        height: selected == v.label ? 9 : 7,
                        alignment: Alignment.centerLeft,
                        decoration: BoxDecoration(
                          color: Brand.background,
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: FractionallySizedBox(
                          widthFactor: value,
                          child: Container(
                            decoration: BoxDecoration(
                              color: selected == v.label
                                  ? Brand.navy
                                  : widget.color,
                              borderRadius: BorderRadius.circular(5),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class PaymentDonut extends StatefulWidget {
  const PaymentDonut({super.key, required this.values});
  final List<ReportValue> values;
  @override
  State<PaymentDonut> createState() => _PaymentDonutState();
}

class _PaymentDonutState extends State<PaymentDonut> {
  int? selected;
  static const colors = [
    Brand.orange,
    Brand.green,
    Color(0xff2563eb),
    Color(0xff7c3aed),
    Color(0xfff59e0b),
  ];
  @override
  Widget build(BuildContext context) {
    final total = widget.values.fold<num>(0, (s, v) => s + v.value);
    if (total <= 0) {
      return const Text(
        'No successful collections in this period',
        style: TextStyle(color: Brand.muted),
      );
    }
    final chosen = selected != null && selected! < widget.values.length
        ? widget.values[selected!]
        : null;
    return Wrap(
      spacing: 18,
      runSpacing: 14,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        GestureDetector(
          onTapUp: (details) {
            final point = details.localPosition - const Offset(65, 65);
            if (point.distance < 39 || point.distance > 65) return;
            final angle =
                (math.atan2(point.dy, point.dx) + math.pi / 2 + math.pi * 2) %
                (math.pi * 2);
            var cursor = 0.0;
            for (var i = 0; i < widget.values.length; i++) {
              cursor += widget.values[i].value / total * math.pi * 2;
              if (angle < cursor) {
                setState(() => selected = i);
                break;
              }
            }
          },
          child: SizedBox(
            width: 130,
            height: 130,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(
                  size: const Size(130, 130),
                  painter: _DonutPainter(widget.values, colors, selected),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      chosen?.label.toUpperCase() ?? 'COLLECTED',
                      style: const TextStyle(fontSize: 9, color: Brand.muted),
                    ),
                    Text(
                      money((chosen?.value ?? total).round()),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        SizedBox(
          width: 160,
          child: Column(
            children: [
              for (var i = 0; i < widget.values.length; i++)
                InkWell(
                  onTap: () => setState(() => selected = i),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      children: [
                        Icon(
                          Icons.circle,
                          size: 9,
                          color: colors[i % colors.length],
                        ),
                        const SizedBox(width: 7),
                        Expanded(
                          child: Text(
                            widget.values[i].label.toUpperCase(),
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                        Text(
                          '${(widget.values[i].value / total * 100).toStringAsFixed(1)}%',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.values, this.colors, this.selected);
  final List<ReportValue> values;
  final List<Color> colors;
  final int? selected;
  @override
  void paint(Canvas canvas, Size size) {
    final total = values.fold<num>(0, (s, v) => s + v.value);
    if (total <= 0) return;
    var start = -math.pi / 2;
    for (var i = 0; i < values.length; i++) {
      final sweep = values[i].value / total * math.pi * 2;
      canvas.drawArc(
        Rect.fromLTWH(9, 9, size.width - 18, size.height - 18),
        start,
        math.max(0, sweep - .025),
        false,
        Paint()
          ..color = colors[i % colors.length]
          ..style = PaintingStyle.stroke
          ..strokeWidth = selected == i ? 18 : 13,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) => true;
}
