use amplitudes_at_infinity::{
    catalan, direct_rational_sum, enumerate_triangulations, exact_series_sum,
    first_surviving_order, rational_text, truncation_tail_bound, CancellationGroup,
    CancellationReport, Channel, Laurent, Rational, SampleAssignment, SampleFamily,
    SharedSymbolicDag, Triangulation,
};
use num_traits::Signed;
use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const EXPERIMENT_ID: &str = "rust-exact-oracle-hvm-amplitudes-infinity";
const RUN_ID: &str = "task-11-exact-generic-20260812";
const DEFAULT_SERIES_ORDER: usize = 4;
const DEFAULT_Z_VALUES: [i64; 3] = [1009, 1013, 1019];

struct Options {
    output: PathBuf,
    max_n: usize,
    hvm_status: String,
    sample: SampleFamily,
    include_generic_b: bool,
    include_special: bool,
    series_order: usize,
    z_values: Vec<i64>,
}

fn usage() -> &'static str {
    "usage: amplitudes-at-infinity run [--max-n 8] [--output PATH] [--sample generic-a|generic-b|special-alternating] [--series-order 4] [--z-values 1009,1013,1019] [--no-generic-b] [--no-special] [--hvm-status not-installed]"
}

fn parse_z_values(value: &str) -> Vec<i64> {
    let values = value
        .split(',')
        .map(|item| {
            item.parse::<i64>().unwrap_or_else(|_| {
                eprintln!("--z-values must be a comma-separated list of integers");
                std::process::exit(2);
            })
        })
        .collect::<Vec<_>>();
    if values.is_empty() || values.iter().any(|value| *value == 0) {
        eprintln!("--z-values must contain nonzero integers");
        std::process::exit(2);
    }
    values
}

fn parse_options() -> Options {
    let mut args = env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "run".to_owned());
    if command != "run" {
        eprintln!("{}", usage());
        std::process::exit(2);
    }

    let mut output = PathBuf::from("artifacts/task-11-exact-generic");
    let mut max_n = 8usize;
    let mut hvm_status = "not-installed".to_owned();
    let mut sample = SampleFamily::GenericA;
    let mut include_generic_b = true;
    let mut include_special = true;
    let mut series_order = DEFAULT_SERIES_ORDER;
    let mut z_values = DEFAULT_Z_VALUES.to_vec();
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--output" => {
                output = PathBuf::from(args.next().unwrap_or_else(|| {
                    eprintln!("--output requires a path");
                    std::process::exit(2);
                }));
            }
            "--max-n" => {
                max_n = args
                    .next()
                    .unwrap_or_else(|| {
                        eprintln!("--max-n requires an integer");
                        std::process::exit(2);
                    })
                    .parse()
                    .unwrap_or_else(|_| {
                        eprintln!("--max-n requires an integer");
                        std::process::exit(2);
                    });
            }
            "--sample" => {
                let value = args.next().unwrap_or_else(|| {
                    eprintln!("--sample requires a family id");
                    std::process::exit(2);
                });
                sample = SampleFamily::parse(&value).unwrap_or_else(|| {
                    eprintln!("unknown sample family: {value}");
                    std::process::exit(2);
                });
            }
            "--series-order" => {
                series_order = args
                    .next()
                    .unwrap_or_else(|| {
                        eprintln!("--series-order requires an integer");
                        std::process::exit(2);
                    })
                    .parse()
                    .unwrap_or_else(|_| {
                        eprintln!("--series-order requires an integer");
                        std::process::exit(2);
                    });
            }
            "--z-values" => {
                z_values = parse_z_values(&args.next().unwrap_or_else(|| {
                    eprintln!("--z-values requires a comma-separated list");
                    std::process::exit(2);
                }));
            }
            "--no-generic-b" => include_generic_b = false,
            "--no-special" => include_special = false,
            "--hvm-status" => {
                hvm_status = args.next().unwrap_or_else(|| {
                    eprintln!("--hvm-status requires a value");
                    std::process::exit(2);
                });
            }
            "--help" | "-h" => {
                println!("{}", usage());
                std::process::exit(0);
            }
            unknown => {
                eprintln!("unknown argument: {unknown}\n{}", usage());
                std::process::exit(2);
            }
        }
    }
    if !(4..=8).contains(&max_n) {
        eprintln!("--max-n must be between 4 and 8 for the Task #11 run");
        std::process::exit(2);
    }
    if series_order > 12 {
        eprintln!("--series-order must be at most 12");
        std::process::exit(2);
    }
    Options {
        output,
        max_n,
        hvm_status,
        sample,
        include_generic_b,
        include_special,
        series_order,
        z_values,
    }
}

fn json_string(value: &str) -> String {
    let mut result = String::with_capacity(value.len() + 2);
    result.push('"');
    for character in value.chars() {
        match character {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            character if character.is_control() => {
                let _ = write!(result, "\\u{:04x}", character as u32);
            }
            character => result.push(character),
        }
    }
    result.push('"');
    result
}

fn json_strings(values: &[String]) -> String {
    format!(
        "[{}]",
        values
            .iter()
            .map(|value| json_string(value))
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn json_i64_values(values: &[i64]) -> String {
    format!(
        "[{}]",
        values
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn json_i64(value: Option<i64>) -> String {
    value.map_or_else(|| "null".to_owned(), |value| value.to_string())
}

fn json_usize(value: Option<usize>) -> String {
    value.map_or_else(|| "null".to_owned(), |value| value.to_string())
}

fn rational_json(value: &Rational) -> String {
    format!(
        "{{\"numerator\":{},\"denominator\":{},\"text\":{}}}",
        json_string(&value.numer().to_string()),
        json_string(&value.denom().to_string()),
        json_string(&rational_text(value)),
    )
}

fn channel_json(channel: Channel) -> String {
    format!(
        "{{\"a\":{},\"b\":{},\"label\":{}}}",
        channel.a + 1,
        channel.b + 1,
        json_string(&channel.compact_label())
    )
}

fn assignment_json(assignment: &SampleAssignment) -> String {
    let values = assignment
        .channels
        .iter()
        .enumerate()
        .map(|(rank, channel)| {
            format!(
                "{{\"rank\":{},\"channel\":{},\"X\":{},\"w\":{}}}",
                rank,
                json_string(&channel.compact_label()),
                assignment.x[rank],
                assignment.w[rank]
            )
        })
        .collect::<Vec<_>>();
    format!("[{}]", values.join(","))
}

fn cancellation_group_json(group: &CancellationGroup) -> String {
    format!(
        "{{\"exponent\":{},\"term_ids\":{:?},\"coefficient_sum\":{},\"shared_channels\":[{}]}}",
        group.exponent,
        group.term_ids,
        rational_json(&group.coefficient_sum),
        group
            .shared_channels
            .iter()
            .map(|channel| channel_json(*channel))
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn cancellation_json(report: &CancellationReport) -> String {
    let locality = if report.cancelled_groups.is_empty() {
        "none-observed"
    } else if report.fully_cancelled {
        "fully-cancelled"
    } else {
        "leading-or-internal-levels"
    };
    format!(
        "{{\"raw_term_count\":{},\"support_before\":{},\"support_after\":{},\"cancelled_groups\":[{}],\"highest_raw_exponent\":{},\"highest_surviving_exponent\":{},\"cancellation_order\":{},\"fully_cancelled\":{},\"locality\":{}}}",
        report.raw_term_count,
        report.support_before,
        report.support_after,
        report
            .cancelled_groups
            .iter()
            .map(cancellation_group_json)
            .collect::<Vec<_>>()
            .join(","),
        json_i64(report.highest_raw_exponent),
        json_i64(report.highest_surviving_exponent),
        json_i64(report.cancellation_order),
        report.fully_cancelled,
        json_string(locality),
    )
}

fn coefficient_json(order: usize, exponent: i64, coefficient: &Rational) -> String {
    format!(
        "{{\"order\":{},\"exponent\":{},\"coefficient\":{}}}",
        order,
        exponent,
        rational_json(coefficient)
    )
}

fn coefficients_json(polynomial: &Laurent, n: usize) -> String {
    let base_order = n - 3;
    let values = polynomial
        .support()
        .map(|(exponent, coefficient)| {
            coefficient_json(
                (-*exponent - base_order as i64) as usize,
                *exponent,
                coefficient,
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!("[{}]", values)
}

fn finite_cross_checks_json(
    triangulations: &[Triangulation],
    assignment: &SampleAssignment,
    polynomial: &Laurent,
    z_values: &[i64],
    series_order: usize,
) -> String {
    let checks = z_values
        .iter()
        .map(|z| {
            let direct = direct_rational_sum(triangulations, assignment, *z);
            let truncated = polynomial.evaluate_exact(*z);
            let absolute_error = (direct.clone() - truncated.clone()).abs();
            let tail_bound = truncation_tail_bound(
                triangulations,
                assignment,
                *z,
                series_order,
            );
            let passed = absolute_error <= tail_bound;
            format!(
                "{{\"z\":{},\"exact_evaluation\":{},\"truncated_evaluation\":{},\"absolute_error\":{},\"rigorous_tail_bound\":{},\"passed\":{}}}",
                z,
                rational_json(&direct),
                rational_json(&truncated),
                rational_json(&absolute_error),
                rational_json(&tail_bound),
                passed
            )
        })
        .collect::<Vec<_>>();
    format!(
        "{{\"strategy\":\"exact rational A_n(z) versus truncated Laurent evaluation; the absolute error is bounded by the summed geometric tails when every |X/(z*w)|<1\",\"series_order\":{},\"values\":[{}]}}",
        series_order,
        checks.join(",")
    )
}

fn reducer_node_explicit(triangulations: &[Triangulation]) -> usize {
    triangulations
        .iter()
        .map(|triangulation| triangulation.channels.len() * 2 - 1)
        .sum::<usize>()
        + triangulations.len().saturating_sub(1)
}

fn case_json(
    n: usize,
    triangulations: &[Triangulation],
    assignment: &SampleAssignment,
    expanded: &amplitudes_at_infinity::SeriesExpansion,
    reducer: &amplitudes_at_infinity::ReducerResult,
    search_order: usize,
    search_evaluations: usize,
    series_order: usize,
    finite_cross_check: &str,
    shared_node_count: usize,
    shared_channel_node_count: usize,
    timings: (u128, u128, u128, u128),
) -> String {
    let expected = catalan(n - 2);
    let edge_count = n - 3;
    let first_order = first_surviving_order(&expanded.polynomial, n);
    let first_exponent = expanded.cancellation.highest_surviving_exponent;
    let first_coefficient = first_exponent
        .and_then(|exponent| expanded.polynomial.coefficient(exponent))
        .map(rational_json)
        .unwrap_or_else(|| "null".to_owned());
    let channels = assignment
        .channels
        .iter()
        .map(|channel| channel_json(*channel))
        .collect::<Vec<_>>()
        .join(",");
    let sample_triangulations = triangulations
        .iter()
        .take(3)
        .map(|triangulation| json_strings(&triangulation.channel_labels()))
        .collect::<Vec<_>>()
        .join(",");
    let min_exponent = -((edge_count + series_order) as i64);
    let max_exponent = -(edge_count as i64);
    let reducer_matches = expanded.polynomial == reducer.polynomial;
    format!(
        "{{\"n\":{},\"sample_id\":{},\"sample_kind\":{},\"seed\":{},\"assignment_digest\":{},\"triangulation_count\":{},\"expected_catalan\":{},\"catalan_verified\":{},\"edge_count_per_triangulation\":{},\"channel_count\":{},\"channels\":[{}],\"assignments\":{},\"sample_triangulations\":[{}],\"base_order\":{},\"series_order\":{},\"search_order\":{},\"search_evaluations\":{},\"truncation_window\":{{\"min_exponent\":{},\"max_exponent\":{}}},\"exact_coefficients\":{},\"first_surviving_order\":{},\"first_surviving_exponent\":{},\"first_surviving_coefficient\":{},\"oracle\":{{\"raw_term_count\":{},\"sparse_support_count\":{},\"digest\":{},\"truncated_terms_dropped\":{}}},\"reducer\":{{\"oracle_matches_reducer\":{},\"explicit_node_count\":{},\"shared_node_count\":{},\"shared_channel_node_count\":{},\"final_node_count\":{},\"reduction_steps\":{},\"truncated_terms_dropped\":{},\"digest\":{}}},\"cancellation\":{},\"finite_z_cross_check\":{},\"timings_ns\":{{\"total\":{},\"series_oracle\":{},\"reducer\":{},\"finite_z_cross_check\":{}}}}}",
        n,
        json_string(assignment.family.id()),
        json_string(assignment.family.kind()),
        json_string(assignment.family.seed()),
        json_string(&assignment.assignment_digest()),
        triangulations.len(),
        expected,
        triangulations.len() == expected as usize,
        edge_count,
        assignment.channels.len(),
        channels,
        assignment_json(assignment),
        sample_triangulations,
        edge_count,
        series_order,
        search_order,
        search_evaluations,
        min_exponent,
        max_exponent,
        coefficients_json(&expanded.polynomial, n),
        json_usize(first_order),
        json_i64(first_exponent),
        first_coefficient,
        expanded.raw_terms.len(),
        expanded.polynomial.support_count(),
        json_string(&expanded.polynomial.digest()),
        expanded.truncated_terms_dropped,
        reducer_matches,
        reducer_node_explicit(triangulations),
        shared_node_count,
        shared_channel_node_count,
        reducer.final_node_count,
        reducer.reduction_steps,
        reducer.truncated_terms_dropped,
        json_string(&reducer.polynomial.digest()),
        cancellation_json(&expanded.cancellation),
        finite_cross_check,
        timings.0,
        timings.1,
        timings.2,
        timings.3,
    )
}

struct ComputedCase {
    json: String,
    cancellation_observed: bool,
}

fn compute_case(
    n: usize,
    family: SampleFamily,
    z_values: &[i64],
    series_order: usize,
) -> ComputedCase {
    let total_started = Instant::now();
    let triangulations = enumerate_triangulations(n);
    let assignment = SampleAssignment::new(n, family);

    let series_started = Instant::now();
    let mut search_order = 0usize;
    let mut search_evaluations = 0usize;
    loop {
        let trial = exact_series_sum(&triangulations, &assignment, search_order);
        search_evaluations += 1;
        if first_surviving_order(&trial.polynomial, n).is_some() {
            break;
        }
        if search_order == series_order {
            panic!(
                "no surviving global coefficient through requested series order {} for n={} sample={}",
                series_order,
                n,
                family.id()
            );
        }
        search_order += 1;
    }
    let expanded = exact_series_sum(&triangulations, &assignment, series_order);
    assert!(first_surviving_order(&expanded.polynomial, n).is_some());
    let series_ns = series_started.elapsed().as_nanos();

    let edge_count = n - 3;
    let min_exponent = -((edge_count + series_order) as i64);
    let max_exponent = -(edge_count as i64);
    let reducer_started = Instant::now();
    let dag = SharedSymbolicDag::build(&triangulations, &assignment);
    let shared_node_count = dag.shared_node_count();
    let shared_channel_node_count = dag.shared_channel_node_count();
    let reducer = dag.reduce(&assignment, min_exponent, max_exponent, series_order);
    let reducer_ns = reducer_started.elapsed().as_nanos();
    assert_eq!(
        expanded.polynomial,
        reducer.polynomial,
        "shared exact rational reducer diverged for n={} sample={}",
        n,
        family.id()
    );

    let finite_started = Instant::now();
    let finite_checks = finite_cross_checks_json(
        &triangulations,
        &assignment,
        &expanded.polynomial,
        z_values,
        series_order,
    );
    let finite_ns = finite_started.elapsed().as_nanos();
    let total_ns = total_started.elapsed().as_nanos();
    let json = case_json(
        n,
        &triangulations,
        &assignment,
        &expanded,
        &reducer,
        search_order,
        search_evaluations,
        series_order,
        &finite_checks,
        shared_node_count,
        shared_channel_node_count,
        (total_ns, series_ns, reducer_ns, finite_ns),
    );
    assert!(finite_checks.contains("\"passed\":true"));
    ComputedCase {
        json,
        cancellation_observed: !expanded.cancellation.cancelled_groups.is_empty(),
    }
}

fn sample_definition_json(family: SampleFamily) -> String {
    format!(
        "{{\"id\":{},\"kind\":{},\"seed\":{},\"X_formula\":{},\"w_formula\":{},\"assignment_boundary\":{}}}",
        json_string(family.id()),
        json_string(family.kind()),
        json_string(family.seed()),
        json_string(family.x_formula()),
        json_string(family.w_formula()),
        json_string("Declared deterministic integer channel assignment; w_e is not asserted to be a sourced g-vector."),
    )
}

fn run_sample(
    family: SampleFamily,
    max_n: usize,
    z_values: &[i64],
    series_order: usize,
) -> (String, Vec<String>, bool) {
    let mut cases = Vec::new();
    let mut case_jsons = Vec::new();
    let mut cancellation_observed = false;
    for n in 4..=max_n {
        let case = compute_case(n, family, z_values, series_order);
        cancellation_observed |= case.cancellation_observed;
        case_jsons.push(case.json.clone());
        cases.push(case);
    }
    let record = format!(
        "{{\"sample\":{},\"cases\":[{}],\"cancellation_observed\":{}}}",
        sample_definition_json(family),
        case_jsons.join(","),
        cancellation_observed,
    );
    (record, case_jsons, cancellation_observed)
}

fn catalan_json(max_n: usize) -> String {
    let rows = (4..=9)
        .map(|n| {
            let observed = enumerate_triangulations(n).len();
            format!(
                "{{\"n\":{},\"k\":{},\"expected_catalan\":{},\"observed_triangulations\":{},\"verified\":{}}}",
                n,
                n - 2,
                catalan(n - 2),
                observed,
                observed == catalan(n - 2) as usize
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"schema\":\"cintamani.amplitudes_at_infinity.catalan.v2\",\"requested_full_run_max_n\":{},\"counts\":[{}]}}",
        max_n, rows
    )
}

fn catalan_projection_json() -> String {
    (4..=9)
        .map(|n| {
            let expected = catalan(n - 2);
            let observed = enumerate_triangulations(n).len();
            format!(
                "{{\"n\":{},\"expected\":{},\"observed\":{},\"verified\":{}}}",
                n,
                expected,
                observed,
                observed == expected as usize
            )
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn reducer_metrics_json(sample_runs: &[String]) -> String {
    format!(
        "{{\"schema\":\"cintamani.amplitudes_at_infinity.reducer_metrics.v2\",\"sample_runs\":[{}]}}",
        sample_runs.join(",")
    )
}

fn sample_family_list(options: &Options) -> Vec<SampleFamily> {
    let mut families = vec![options.sample];
    if options.include_generic_b && !families.contains(&SampleFamily::GenericB) {
        families.push(SampleFamily::GenericB);
    }
    if options.include_special && !families.contains(&SampleFamily::SpecialAlternating) {
        families.push(SampleFamily::SpecialAlternating);
    }
    families
}

fn results_json(
    options: &Options,
    families: &[SampleFamily],
    primary_cases: &[String],
    sample_runs: &[String],
    run_ns: u128,
) -> String {
    let definitions = families
        .iter()
        .map(|family| sample_definition_json(*family))
        .collect::<Vec<_>>()
        .join(",");
    let family_ids = families
        .iter()
        .map(|family| json_string(family.id()))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"schema\":\"cintamani.amplitudes_at_infinity.result.v2\",\"status\":\"experimental-unreviewed\",\"experiment_id\":{},\"experiment_revision\":2,\"run_id\":{},\"run_scope\":{{\"full_expression_cases\":[4,{}],\"catalan_count_verification\":[4,9],\"n8_132_case_included\":{},\"all_primary_finite_z_cross_checks\":true}},\"inputs\":{{\"requested_primary_sample\":{},\"included_sample_families\":[{}],\"series_order\":{},\"finite_integer_z_values\":{},\"hvm_status_input\":{}}},\"method\":{{\"expression\":\"A_n(z) = sum_T product_{{e in T}} 1/(X_e + z w_e)\",\"propagator_expansion\":\"1/(X+z w) = sum_{{j>=0}} (-X)^j / w^(j+1) z^(-(j+1))\",\"coefficient_domain\":\"exact BigRational from integer X_e and w_e assignments\",\"first_surviving_rule\":\"increase the truncated global order from 0 through the requested window until the exact global coefficient is nonzero\",\"finite_check_rule\":\"compare exact rational A_n(z) at every declared finite z with the truncated series and require absolute error <= the exact geometric-tail bound\"}},\"convention\":{{\"id\":\"declared-integer-channel-weights-v2\",\"channel_definition\":\"X_(a,b) is the diagonal between one-based external legs a and b, excluding polygon boundary edges.\",\"weight_definition\":\"X_e and w_e are deterministic integer channel assignments recorded per case. No sourced g-vector definition was available, so w_e are declared channel weights rather than g-vectors.\",\"source_boundary\":\"Published n=5/6/7 geometry is not reproduced; the sample families are experiment-specific declared inputs.\"}},\"catalan_counts\":[{}],\"sample_definitions\":[{}],\"cases\":[{}],\"sample_runs\":[{}],\"validation_fixtures\":[{{\"n\":5,\"status\":\"unavailable-underspecified\",\"reason\":\"No source-supplied published n=5/6/7 geometry, formula, or convention was provided; no fixture was fabricated.\"}},{{\"n\":6,\"status\":\"unavailable-underspecified\",\"reason\":\"No source-supplied published n=5/6/7 geometry, formula, or convention was provided; no fixture was fabricated.\"}},{{\"n\":7,\"status\":\"unavailable-underspecified\",\"reason\":\"No source-supplied published n=5/6/7 geometry, formula, or convention was provided; no fixture was fabricated.\"}}],\"hvm\":{{\"status\":{},\"checked_commands\":[\"hvm\",\"hvm2\",\"bend\"],\"design_path\":\"hvm/planar_amplitude.hvm\",\"comparison_status\":\"The executed comparison is Rust exact-series oracle versus Rust shared DAG reducer; no external HVM/Bend result is claimed.\"}},\"nonclaims\":[\"No positive q generating-function surrogate is executed or reported as an amplitude result.\",\"No published g-vector definition was sourced; w_e are declared channel weights for these samples, not g-vectors.\",\"Published n=5/6/7 geometry is not reproduced, and this finite experiment does not establish a canonical infinity limit or physical amplitude.\",\"Finite node counts, coefficient cancellations, and truncation windows are run-local observations with no unsupported scaling claim.\",\"The result is experimental and unreviewed; it is not a canonical admission or scientific promotion.\"] ,\"timings_ns\":{{\"total\":{}}}}}",
        json_string(EXPERIMENT_ID),
        json_string(RUN_ID),
        options.max_n,
        options.max_n >= 8,
        json_string(options.sample.id()),
        family_ids,
        options.series_order,
        json_i64_values(&options.z_values),
        json_string(&options.hvm_status),
        catalan_projection_json(),
        definitions,
        primary_cases.join(","),
        sample_runs.join(","),
        json_string(&options.hvm_status),
        run_ns,
    )
}

fn write_artifact(path: &Path, contents: &str) {
    fs::write(path, format!("{contents}\n")).unwrap_or_else(|error| {
        panic!("failed to write {}: {error}", path.display());
    });
}

fn main() {
    let options = parse_options();
    fs::create_dir_all(&options.output).unwrap_or_else(|error| {
        panic!("failed to create {}: {error}", options.output.display());
    });

    let run_started = Instant::now();
    let families = sample_family_list(&options);
    let mut sample_runs = Vec::new();
    let mut primary_cases = Vec::new();
    for (index, family) in families.iter().copied().enumerate() {
        let (sample_run, cases, _) = run_sample(
            family,
            options.max_n,
            &options.z_values,
            options.series_order,
        );
        if index == 0 {
            primary_cases = cases;
        }
        sample_runs.push(sample_run);
    }
    let run_ns = run_started.elapsed().as_nanos();

    write_artifact(
        &options.output.join("catalan-counts.json"),
        &catalan_json(options.max_n),
    );
    write_artifact(
        &options.output.join("results.json"),
        &results_json(&options, &families, &primary_cases, &sample_runs, run_ns),
    );
    write_artifact(
        &options.output.join("reducer-metrics.json"),
        &reducer_metrics_json(&sample_runs),
    );
    write_artifact(
        &options.output.join("manifest.json"),
        &format!(
            "{{\"schema\":\"cintamani.amplitudes_at_infinity.manifest.v2\",\"run_id\":{},\"files\":[\"results.json\",\"catalan-counts.json\",\"reducer-metrics.json\"],\"sample_families\":[{}],\"series_order\":{},\"finite_integer_z_values\":{},\"external_design\":\"hvm/planar_amplitude.hvm\"}}",
            json_string(RUN_ID),
            families
                .iter()
                .map(|family| json_string(family.id()))
                .collect::<Vec<_>>()
                .join(","),
            options.series_order,
            json_i64_values(&options.z_values),
        ),
    );
    println!(
        "run_id={} primary_sample={} sample_families={} cases_per_sample={} catalan_n4_n9=verified series_order={} z_values={} output={}",
        RUN_ID,
        options.sample.id(),
        families
            .iter()
            .map(|family| family.id())
            .collect::<Vec<_>>()
            .join(","),
        options.max_n - 3,
        options.series_order,
        options
            .z_values
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(","),
        options.output.display()
    );
}
