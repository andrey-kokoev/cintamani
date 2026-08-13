//! Exact, bounded combinatorics for the corrected Cintamani Task #11 slice.
//!
//! The executed object is the declared rational propagator expression
//!
//! ```text
//! A_n(z) = sum_T product_{e in T} 1 / (X_e + z w_e)
//! ```
//!
//! where `X_e` and `w_e` are explicit integer assignments.  A propagator is
//! expanded at `z = infinity` as
//!
//! ```text
//! 1 / (X + z w) = sum_{j >= 0} (-X)^j / w^(j+1) z^(-(j+1)).
//! ```
//!
//! All coefficients in the finite Laurent window are `BigRational` values.
//! The sample families are declared experiment inputs; they are not sourced
//! cluster-algebra g-vectors.  No published worlds-at-infinity expression is
//! reproduced by this crate.

use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, Zero};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

/// Exact rational coefficient type used by the Laurent series oracle.
pub type Rational = BigRational;

/// A planar channel is the diagonal `(a,b)` of an n-gon, with zero-based
/// vertices and canonical endpoint order.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Channel {
    pub a: usize,
    pub b: usize,
}

impl Channel {
    pub fn new(a: usize, b: usize) -> Self {
        assert!(a < b, "channel endpoints must be ordered");
        Self { a, b }
    }

    /// Human-facing label using the one-based external-leg convention.
    pub fn label(self) -> String {
        format!("X_{{{}, {}}}", self.a + 1, self.b + 1)
    }

    pub fn compact_label(self) -> String {
        format!("X_{}_{}", self.a + 1, self.b + 1)
    }
}

/// A triangulation is stored as a lexicographically sorted channel list.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct Triangulation {
    pub channels: Vec<Channel>,
}

impl Triangulation {
    pub fn channel_labels(&self) -> Vec<String> {
        self.channels
            .iter()
            .map(|channel| channel.compact_label())
            .collect()
    }
}

fn is_polygon_boundary_edge(n: usize, channel: Channel) -> bool {
    channel.b == channel.a + 1 || (channel.a == 0 && channel.b + 1 == n)
}

/// Return every internal planar channel in deterministic lexicographic order.
pub fn channels(n: usize) -> Vec<Channel> {
    assert!(n >= 3, "a polygon must have at least three vertices");
    let mut result = Vec::new();
    for a in 0..n {
        for b in (a + 1)..n {
            let channel = Channel::new(a, b);
            if !is_polygon_boundary_edge(n, channel) {
                result.push(channel);
            }
        }
    }
    result
}

fn triangulate_interval(n: usize, lo: usize, hi: usize) -> Vec<Vec<Channel>> {
    if hi <= lo + 1 {
        return vec![Vec::new()];
    }

    let mut result = Vec::new();
    // The triangle (lo, k, hi) is the unique triangle incident to the base
    // edge (lo, hi), so increasing k gives a deterministic, duplicate-free
    // Catalan recursion.
    for k in (lo + 1)..hi {
        let left = triangulate_interval(n, lo, k);
        let right = triangulate_interval(n, k, hi);
        for left_diagonals in &left {
            for right_diagonals in &right {
                let mut diagonals = left_diagonals.clone();
                diagonals.extend(right_diagonals.iter().copied());
                let left_edge = Channel::new(lo, k);
                if !is_polygon_boundary_edge(n, left_edge) {
                    diagonals.push(left_edge);
                }
                let right_edge = Channel::new(k, hi);
                if !is_polygon_boundary_edge(n, right_edge) {
                    diagonals.push(right_edge);
                }
                diagonals.sort_unstable();
                diagonals.dedup();
                result.push(diagonals);
            }
        }
    }
    result.sort_unstable();
    result.dedup();
    result
}

/// Enumerate all triangulations of the labelled n-gon.
pub fn enumerate_triangulations(n: usize) -> Vec<Triangulation> {
    assert!(n >= 3, "a polygon must have at least three vertices");
    triangulate_interval(n, 0, n - 1)
        .into_iter()
        .map(|channels| Triangulation { channels })
        .collect()
}

/// Catalan number C_k, used here with k = n - 2 for polygon triangulations.
pub fn catalan(k: usize) -> u64 {
    let mut values = vec![0u64; k + 1];
    values[0] = 1;
    for index in 1..=k {
        values[index] = values[index - 1]
            .checked_mul((4 * index - 2) as u64)
            .expect("Catalan value overflowed u64")
            / (index as u64 + 1);
    }
    values[k]
}

/// Deterministic exact sample families used by the finite experiment.
///
/// The two `generic-*` families are positive integer assignments intended to
/// be ordinary sample directions.  `special-alternating` is deliberately
/// nongeneric: it alternates the signs of `w` by channel rank and is retained
/// as an explicit cancellation control, never as a generic result.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum SampleFamily {
    GenericA,
    GenericB,
    SpecialAlternating,
}

impl SampleFamily {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "generic-a" => Some(Self::GenericA),
            "generic-b" => Some(Self::GenericB),
            "special-alternating" => Some(Self::SpecialAlternating),
            _ => None,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::GenericA => "generic-a",
            Self::GenericB => "generic-b",
            Self::SpecialAlternating => "special-alternating",
        }
    }

    pub fn kind(self) -> &'static str {
        match self {
            Self::GenericA | Self::GenericB => "generic-sample",
            Self::SpecialAlternating => "special-cancellation-control",
        }
    }

    pub fn seed(self) -> &'static str {
        match self {
            Self::GenericA => "task11-generic-a-v1",
            Self::GenericB => "task11-generic-b-v1",
            Self::SpecialAlternating => "task11-special-alternating-control-v1",
        }
    }

    pub fn x_formula(self) -> &'static str {
        match self {
            Self::GenericA => "X_(a,b) = 17 + 3a + 5b + a*b, with a,b one-based",
            Self::GenericB => "X_(a,b) = 23 + 7a + 11b + 2a*b + a^2, with a,b one-based",
            Self::SpecialAlternating => "X_(a,b) = 29 + a + 3b + a*b, with a,b one-based",
        }
    }

    pub fn w_formula(self) -> &'static str {
        match self {
            Self::GenericA => "w_(a,b) = 11 + 2a + 7b + a^2, with a,b one-based",
            Self::GenericB => "w_(a,b) = 13 + 5a + 3b + b^2, with a,b one-based",
            Self::SpecialAlternating => "w_r = (-1)^r for lexicographic channel rank r",
        }
    }

    fn values(self, rank: usize, channel: Channel) -> (i64, i64) {
        let a = (channel.a + 1) as i64;
        let b = (channel.b + 1) as i64;
        match self {
            Self::GenericA => (17 + 3 * a + 5 * b + a * b, 11 + 2 * a + 7 * b + a * a),
            Self::GenericB => (
                23 + 7 * a + 11 * b + 2 * a * b + a * a,
                13 + 5 * a + 3 * b + b * b,
            ),
            Self::SpecialAlternating => {
                (29 + a + 3 * b + a * b, if rank % 2 == 0 { 1 } else { -1 })
            }
        }
    }
}

/// Explicit integer assignments for every channel in one sample family.
///
/// These assignments are inputs to the experiment.  In particular, `w` is a
/// declared channel-weight vector, not a sourced g-vector definition.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SampleAssignment {
    pub n: usize,
    pub family: SampleFamily,
    pub channels: Vec<Channel>,
    pub x: Vec<i64>,
    pub w: Vec<i64>,
}

impl SampleAssignment {
    pub fn new(n: usize, family: SampleFamily) -> Self {
        let channels = channels(n);
        let values = channels
            .iter()
            .enumerate()
            .map(|(rank, channel)| family.values(rank, *channel))
            .collect::<Vec<_>>();
        let x = values.iter().map(|(x, _)| *x).collect();
        let w = values.iter().map(|(_, w)| *w).collect();
        Self::from_values(n, family, channels, x, w)
    }

    /// Build a reproducible custom assignment for library callers.  The CLI
    /// selects the documented formula families, while this constructor keeps
    /// integer/rational input configurable without changing the oracle.
    pub fn from_values(
        n: usize,
        family: SampleFamily,
        channel_list: Vec<Channel>,
        x: Vec<i64>,
        w: Vec<i64>,
    ) -> Self {
        assert_eq!(
            channel_list,
            channels(n),
            "custom channels must be canonical"
        );
        assert_eq!(
            x.len(),
            channel_list.len(),
            "one X value is required per channel"
        );
        assert_eq!(
            w.len(),
            channel_list.len(),
            "one w value is required per channel"
        );
        assert!(
            w.iter().all(|value| *value != 0),
            "channel weights cannot be zero"
        );
        Self {
            n,
            family,
            channels: channel_list,
            x,
            w,
        }
    }

    pub fn rank_of(&self, channel: Channel) -> usize {
        self.channels
            .binary_search(&channel)
            .expect("triangulation contained a channel outside its assignment")
    }

    pub fn x_of(&self, channel: Channel) -> i64 {
        self.x[self.rank_of(channel)]
    }

    pub fn w_of(&self, channel: Channel) -> i64 {
        self.w[self.rank_of(channel)]
    }

    pub fn assignment_digest(&self) -> String {
        let mut canonical = format!("n={};family={};", self.n, self.family.id());
        for (rank, channel) in self.channels.iter().enumerate() {
            let _ = write!(
                canonical,
                "{}:{}:{}:{}:{};",
                rank, channel.a, channel.b, self.x[rank], self.w[rank]
            );
        }
        fnv1a64(canonical.as_bytes())
    }
}

/// Exact rational representation of an integer.
pub fn rational_integer(value: i64) -> Rational {
    BigRational::from_integer(BigInt::from(value))
}

/// Stable human-readable exact rational text, used by artifact digests.
pub fn rational_text(value: &Rational) -> String {
    if value.denom() == &BigInt::one() {
        value.numer().to_string()
    } else {
        format!("{}/{}", value.numer(), value.denom())
    }
}

fn rational_integer_power(base: i64, exponent: i64) -> Rational {
    assert!(
        base != 0 || exponent >= 0,
        "zero cannot have a negative power"
    );
    let base = BigInt::from(base);
    if exponent >= 0 {
        BigRational::from_integer(base.pow(exponent as u32))
    } else {
        BigRational::new(BigInt::one(), base.pow((-exponent) as u32))
    }
}

/// A sparse exact Laurent polynomial in the asymptotic variable `z`.
/// Exponents are normally negative and coefficients are exact rationals.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Laurent {
    terms: BTreeMap<i64, Rational>,
}

impl Laurent {
    pub fn zero() -> Self {
        Self {
            terms: BTreeMap::new(),
        }
    }

    pub fn from_monomial(exponent: i64, coefficient: Rational) -> Self {
        let mut result = Self::zero();
        result.add_term(exponent, coefficient);
        result
    }

    pub fn add_term(&mut self, exponent: i64, coefficient: Rational) {
        if coefficient.is_zero() {
            return;
        }
        let entry = self.terms.entry(exponent).or_insert_with(Rational::zero);
        *entry += coefficient;
        if entry.is_zero() {
            self.terms.remove(&exponent);
        }
    }

    pub fn add_assign(&mut self, other: &Self) {
        for (&exponent, coefficient) in &other.terms {
            self.add_term(exponent, coefficient.clone());
        }
    }

    pub fn mul_truncated(
        &self,
        other: &Self,
        min_exponent: i64,
        max_exponent: i64,
    ) -> (Self, usize) {
        let mut result = Self::zero();
        let mut dropped = 0;
        for (&left_exponent, left_coefficient) in &self.terms {
            for (&right_exponent, right_coefficient) in &other.terms {
                let exponent = left_exponent + right_exponent;
                let coefficient = left_coefficient * right_coefficient;
                if exponent < min_exponent || exponent > max_exponent {
                    if !coefficient.is_zero() {
                        dropped += 1;
                    }
                } else {
                    result.add_term(exponent, coefficient);
                }
            }
        }
        (result, dropped)
    }

    pub fn truncate(&self, min_exponent: i64, max_exponent: i64) -> (Self, usize) {
        let mut result = Self::zero();
        let mut dropped = 0;
        for (&exponent, coefficient) in &self.terms {
            if exponent < min_exponent || exponent > max_exponent {
                if !coefficient.is_zero() {
                    dropped += 1;
                }
            } else {
                result.add_term(exponent, coefficient.clone());
            }
        }
        (result, dropped)
    }

    pub fn support(&self) -> impl Iterator<Item = (&i64, &Rational)> {
        self.terms.iter()
    }

    pub fn support_count(&self) -> usize {
        self.terms.len()
    }

    pub fn coefficient(&self, exponent: i64) -> Option<&Rational> {
        self.terms.get(&exponent)
    }

    /// Exact evaluation at a nonzero integer z.  This is used only as an
    /// independent check of the truncated asymptotic series.
    pub fn evaluate_exact(&self, z: i64) -> Rational {
        assert!(z != 0, "Laurent evaluation requires nonzero z");
        self.terms
            .iter()
            .fold(Rational::zero(), |mut sum, (&exponent, coefficient)| {
                sum += coefficient * rational_integer_power(z, exponent);
                sum
            })
    }

    pub fn canonical_string(&self) -> String {
        let mut result = String::new();
        for (&exponent, coefficient) in &self.terms {
            let _ = write!(result, "{}:{};", exponent, rational_text(coefficient));
        }
        result
    }

    pub fn digest(&self) -> String {
        fnv1a64(self.canonical_string().as_bytes())
    }
}

/// One signed exact Laurent contribution from one triangulation and one
/// asymptotic order before global coefficient aggregation.
#[derive(Clone, Debug)]
pub struct RawTerm {
    pub term_id: usize,
    pub order: usize,
    pub exponent: i64,
    pub coefficient: Rational,
    pub channels: Vec<Channel>,
}

#[derive(Clone, Debug)]
pub struct CancellationGroup {
    pub exponent: i64,
    pub term_ids: Vec<usize>,
    pub coefficient_sum: Rational,
    pub shared_channels: Vec<Channel>,
}

#[derive(Clone, Debug)]
pub struct CancellationReport {
    pub raw_term_count: usize,
    pub support_before: usize,
    pub support_after: usize,
    pub cancelled_groups: Vec<CancellationGroup>,
    pub highest_raw_exponent: Option<i64>,
    pub highest_surviving_exponent: Option<i64>,
    /// Difference between the highest raw exponent and the highest surviving
    /// exponent.  Zero means no leading exponent level was cancelled.
    pub cancellation_order: Option<i64>,
    pub fully_cancelled: bool,
}

fn shared_channels(groups: &[&RawTerm]) -> Vec<Channel> {
    let Some(first) = groups.first() else {
        return Vec::new();
    };
    let mut intersection: BTreeSet<Channel> = first.channels.iter().copied().collect();
    for term in groups.iter().skip(1) {
        let channels: BTreeSet<Channel> = term.channels.iter().copied().collect();
        intersection.retain(|channel| channels.contains(channel));
    }
    intersection.into_iter().collect()
}

/// Aggregate signed exact terms and identify cancelled exponent levels.
pub fn sparse_sum(raw_terms: &[RawTerm]) -> (Laurent, CancellationReport) {
    let mut groups: BTreeMap<i64, Vec<&RawTerm>> = BTreeMap::new();
    for term in raw_terms {
        if !term.coefficient.is_zero() {
            groups.entry(term.exponent).or_default().push(term);
        }
    }

    let mut result = Laurent::zero();
    let mut cancelled_groups = Vec::new();
    let mut surviving_exponents = Vec::new();
    for (&exponent, terms) in &groups {
        let coefficient_sum = terms
            .iter()
            .fold(Rational::zero(), |sum, term| sum + term.coefficient.clone());
        if coefficient_sum.is_zero() {
            cancelled_groups.push(CancellationGroup {
                exponent,
                term_ids: terms.iter().map(|term| term.term_id).collect(),
                coefficient_sum,
                shared_channels: shared_channels(terms),
            });
        } else {
            result.add_term(exponent, coefficient_sum);
            surviving_exponents.push(exponent);
        }
    }

    let highest_raw_exponent = groups.keys().next_back().copied();
    let highest_surviving_exponent = surviving_exponents.into_iter().max();
    let cancellation_order = match (highest_raw_exponent, highest_surviving_exponent) {
        (Some(raw), Some(surviving)) => Some(raw - surviving),
        _ => None,
    };
    let report = CancellationReport {
        raw_term_count: raw_terms.len(),
        support_before: groups.len(),
        support_after: result.support_count(),
        cancelled_groups,
        highest_raw_exponent,
        highest_surviving_exponent,
        cancellation_order,
        fully_cancelled: result.support_count() == 0 && !raw_terms.is_empty(),
    };
    (result, report)
}

/// Expand one propagator through asymptotic order `max_order`.
pub fn propagator_series(
    assignment: &SampleAssignment,
    channel: Channel,
    max_order: usize,
) -> Laurent {
    let rank = assignment.rank_of(channel);
    let x = assignment.x[rank];
    let w = assignment.w[rank];
    assert!(w != 0, "channel weights cannot be zero");
    let mut result = Laurent::zero();
    for order in 0..=max_order {
        let numerator = BigInt::from(-x).pow(order as u32);
        let denominator = BigInt::from(w).pow((order + 1) as u32);
        result.add_term(
            -((order + 1) as i64),
            BigRational::new(numerator, denominator),
        );
    }
    result
}

/// Expand and multiply every propagator in one triangulation.  The
/// intermediate window is tightened to the number of processed propagators,
/// so only total asymptotic orders through `max_order` survive.
pub fn expand_triangulation(
    triangulation: &Triangulation,
    assignment: &SampleAssignment,
    max_order: usize,
) -> (Laurent, usize) {
    let mut result = Laurent::from_monomial(0, Rational::one());
    let mut dropped = 0;
    for (processed, channel) in triangulation.channels.iter().enumerate() {
        let factor = propagator_series(assignment, *channel, max_order);
        let count = processed + 1;
        let min_exponent = -((count + max_order) as i64);
        let max_exponent = -(count as i64);
        let (next, factor_dropped) = result.mul_truncated(&factor, min_exponent, max_exponent);
        result = next;
        dropped += factor_dropped;
    }
    (result, dropped)
}

/// The result of exact finite-window series expansion and global summation.
#[derive(Clone, Debug)]
pub struct SeriesExpansion {
    pub polynomial: Laurent,
    pub cancellation: CancellationReport,
    pub raw_terms: Vec<RawTerm>,
    pub truncated_terms_dropped: usize,
}

/// Expand every triangulation, preserve signed rational contributions, and
/// sum them exactly in the requested Laurent window.
pub fn exact_series_sum(
    triangulations: &[Triangulation],
    assignment: &SampleAssignment,
    max_order: usize,
) -> SeriesExpansion {
    let edge_count = assignment.n - 3;
    let mut raw_terms = Vec::new();
    let mut truncated_terms_dropped = 0;
    for (term_id, triangulation) in triangulations.iter().enumerate() {
        assert_eq!(triangulation.channels.len(), edge_count);
        let (series, dropped) = expand_triangulation(triangulation, assignment, max_order);
        truncated_terms_dropped += dropped;
        for (&exponent, coefficient) in series.support() {
            let order = (-exponent - edge_count as i64) as usize;
            raw_terms.push(RawTerm {
                term_id,
                order,
                exponent,
                coefficient: coefficient.clone(),
                channels: triangulation.channels.clone(),
            });
        }
    }
    let (polynomial, cancellation) = sparse_sum(&raw_terms);
    SeriesExpansion {
        polynomial,
        cancellation,
        raw_terms,
        truncated_terms_dropped,
    }
}

/// Return the first nonzero global asymptotic order in a series window.
pub fn first_surviving_order(series: &Laurent, n: usize) -> Option<usize> {
    let base_order = n - 3;
    series
        .support()
        .map(|(exponent, _)| (-*exponent - base_order as i64) as usize)
        .min()
}

/// Independently evaluate the original rational expression at an integer z.
pub fn direct_rational_sum(
    triangulations: &[Triangulation],
    assignment: &SampleAssignment,
    z: i64,
) -> Rational {
    assert!(z != 0, "direct evaluation requires nonzero z");
    triangulations
        .iter()
        .fold(Rational::zero(), |mut sum, triangulation| {
            let mut product = Rational::one();
            for channel in &triangulation.channels {
                let denominator = assignment.x_of(*channel) + z * assignment.w_of(*channel);
                assert!(denominator != 0, "finite evaluation hit a propagator pole");
                product *= BigRational::new(BigInt::one(), BigInt::from(denominator));
            }
            sum += product;
            sum
        })
}

/// Rigorous absolute tail bound for the truncated asymptotic evaluation.
///
/// For each triangulation and channel, let
/// `rho = |X/(z*w)|`.  When every `rho < 1`, the omitted absolute series mass
/// is bounded exactly by the product of geometric tails.  Summing that bound
/// over triangulations certifies the finite-z comparison without treating the
/// truncation as an exact identity.
pub fn truncation_tail_bound(
    triangulations: &[Triangulation],
    assignment: &SampleAssignment,
    z: i64,
    max_order: usize,
) -> Rational {
    assert!(z != 0, "tail bound requires nonzero z");
    let abs_z = BigInt::from(z).abs();
    let mut total = Rational::zero();
    for triangulation in triangulations {
        let mut coefficients = vec![Rational::one()];
        let mut base = Rational::one();
        let mut full_sum = Rational::one();
        for channel in &triangulation.channels {
            let x = BigInt::from(assignment.x_of(*channel)).abs();
            let w = BigInt::from(assignment.w_of(*channel)).abs();
            let denominator = &abs_z * &w;
            let rho = BigRational::new(x, denominator.clone());
            assert!(rho < Rational::one(), "tail bound requires |X/(z*w)| < 1");
            base /= BigRational::from_integer(denominator);
            full_sum /= Rational::one() - rho.clone();

            let mut next = vec![Rational::zero(); max_order + 1];
            let mut power = Rational::one();
            for degree in 0..=max_order {
                let previous_limit = (max_order - degree).min(coefficients.len() - 1);
                for previous in 0..=previous_limit {
                    next[previous + degree] += coefficients[previous].clone() * power.clone();
                }
                power *= rho.clone();
            }
            coefficients = next;
        }
        let finite_sum = coefficients
            .into_iter()
            .fold(Rational::zero(), |sum, coefficient| sum + coefficient);
        total += base * (full_sum - finite_sum);
    }
    total
}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
enum NodeKey {
    Unit,
    Propagator(usize),
    Mul(usize, usize),
    Add(usize, usize),
}

/// Hash-consed symbolic DAG for the interaction-net comparison.
///
/// Propagator agents are shared by channel rank.  Reduction expands those
/// agents into the same exact rational Laurent domain as the direct oracle,
/// with a declared finite window.  This preserves the useful DAG/reducer
/// infrastructure without presenting it as an external HVM execution.
#[derive(Clone, Debug)]
pub struct SharedSymbolicDag {
    nodes: Vec<NodeKey>,
    intern: BTreeMap<NodeKey, usize>,
    root: usize,
    explicit_node_count: usize,
}

#[derive(Clone, Debug)]
pub struct ReducerResult {
    pub polynomial: Laurent,
    pub reduction_steps: usize,
    pub final_node_count: usize,
    pub truncated_terms_dropped: usize,
}

impl SharedSymbolicDag {
    fn new() -> Self {
        Self {
            nodes: Vec::new(),
            intern: BTreeMap::new(),
            root: 0,
            explicit_node_count: 0,
        }
    }

    fn intern_node(&mut self, key: NodeKey) -> usize {
        if let Some(&node_id) = self.intern.get(&key) {
            return node_id;
        }
        let node_id = self.nodes.len();
        self.nodes.push(key.clone());
        self.intern.insert(key, node_id);
        node_id
    }

    pub fn build(triangulations: &[Triangulation], assignment: &SampleAssignment) -> Self {
        let mut dag = Self::new();
        let mut roots = Vec::with_capacity(triangulations.len());
        let mut explicit = 0usize;

        for triangulation in triangulations {
            let mut term = None;
            for channel in &triangulation.channels {
                let rank = assignment.rank_of(*channel);
                let propagator = dag.intern_node(NodeKey::Propagator(rank));
                term = Some(match term {
                    None => propagator,
                    Some(previous) => {
                        explicit += 1;
                        dag.intern_node(NodeKey::Mul(previous, propagator))
                    }
                });
                explicit += 1;
            }
            let term = term.unwrap_or_else(|| {
                explicit += 1;
                dag.intern_node(NodeKey::Unit)
            });
            roots.push(term);
        }

        let mut root = roots.first().copied().unwrap_or_else(|| {
            explicit += 1;
            dag.intern_node(NodeKey::Unit)
        });
        for term in roots.into_iter().skip(1) {
            explicit += 1;
            root = dag.intern_node(NodeKey::Add(root, term));
        }
        dag.root = root;
        dag.explicit_node_count = explicit;
        dag
    }

    pub fn explicit_node_count(&self) -> usize {
        self.explicit_node_count
    }

    pub fn shared_node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn shared_channel_node_count(&self) -> usize {
        self.nodes
            .iter()
            .filter(|node| matches!(node, NodeKey::Propagator(_)))
            .count()
    }

    fn evaluate_node(
        &self,
        node_id: usize,
        assignment: &SampleAssignment,
        series_order: usize,
        min_exponent: i64,
        memo: &mut BTreeMap<usize, Laurent>,
        steps: &mut usize,
        dropped: &mut usize,
    ) -> Laurent {
        if let Some(value) = memo.get(&node_id) {
            return value.clone();
        }
        *steps += 1;
        let value = match self.nodes[node_id].clone() {
            NodeKey::Unit => Laurent::from_monomial(0, Rational::one()),
            NodeKey::Propagator(rank) => {
                propagator_series(assignment, assignment.channels[rank], series_order)
            }
            NodeKey::Mul(left, right) => {
                let left_value = self.evaluate_node(
                    left,
                    assignment,
                    series_order,
                    min_exponent,
                    memo,
                    steps,
                    dropped,
                );
                let right_value = self.evaluate_node(
                    right,
                    assignment,
                    series_order,
                    min_exponent,
                    memo,
                    steps,
                    dropped,
                );
                // The upper bound is zero for internal nodes.  Every root
                // term has exactly n-3 propagators, and the global lower
                // bound is safe to apply early because multiplication only
                // lowers exponents.
                let (value, count) = left_value.mul_truncated(&right_value, min_exponent, 0);
                *dropped += count;
                value
            }
            NodeKey::Add(left, right) => {
                let mut value = self.evaluate_node(
                    left,
                    assignment,
                    series_order,
                    min_exponent,
                    memo,
                    steps,
                    dropped,
                );
                let right_value = self.evaluate_node(
                    right,
                    assignment,
                    series_order,
                    min_exponent,
                    memo,
                    steps,
                    dropped,
                );
                value.add_assign(&right_value);
                value
            }
        };
        memo.insert(node_id, value.clone());
        value
    }

    pub fn reduce(
        &self,
        assignment: &SampleAssignment,
        min_exponent: i64,
        max_exponent: i64,
        series_order: usize,
    ) -> ReducerResult {
        let mut memo = BTreeMap::new();
        let mut reduction_steps = 0;
        let mut truncated_terms_dropped = 0;
        let polynomial = self.evaluate_node(
            self.root,
            assignment,
            series_order,
            min_exponent,
            &mut memo,
            &mut reduction_steps,
            &mut truncated_terms_dropped,
        );
        let (polynomial, final_dropped) = polynomial.truncate(min_exponent, max_exponent);
        truncated_terms_dropped += final_dropped;
        let final_node_count =
            polynomial.support_count() + usize::from(polynomial.support_count() > 1);
        ReducerResult {
            polynomial,
            reduction_steps,
            final_node_count,
            truncated_terms_dropped,
        }
    }
}

pub fn fnv1a64(bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("fnv1a64:{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn triangulation_counts_match_catalan_numbers_n4_to_n9() {
        let expected = [2, 5, 14, 42, 132, 429];
        for (offset, expected_count) in expected.into_iter().enumerate() {
            let n = offset + 4;
            assert_eq!(enumerate_triangulations(n).len(), expected_count);
            assert_eq!(catalan(n - 2), expected_count as u64);
        }
    }

    #[test]
    fn channels_and_triangulations_are_deterministic_and_canonical() {
        let first = enumerate_triangulations(8);
        let second = enumerate_triangulations(8);
        assert_eq!(first, second);
        for triangulation in first {
            assert_eq!(triangulation.channels.len(), 5);
            assert!(triangulation
                .channels
                .windows(2)
                .all(|pair| pair[0] < pair[1]));
        }
    }

    #[test]
    fn documented_assignments_are_exact_and_deterministic() {
        let first = SampleAssignment::new(8, SampleFamily::GenericA);
        let second = SampleAssignment::new(8, SampleFamily::GenericA);
        assert_eq!(first, second);
        assert!(first.x.iter().all(|value| *value > 0));
        assert!(first.w.iter().all(|value| *value > 0));
        assert_eq!(first.assignment_digest(), second.assignment_digest());
    }

    #[test]
    fn exact_series_and_shared_reducer_agree() {
        let triangulations = enumerate_triangulations(7);
        let assignment = SampleAssignment::new(7, SampleFamily::GenericA);
        let expanded = exact_series_sum(&triangulations, &assignment, 4);
        assert_eq!(first_surviving_order(&expanded.polynomial, 7), Some(0));
        assert_eq!(expanded.cancellation.cancelled_groups.len(), 0);
        let dag = SharedSymbolicDag::build(&triangulations, &assignment);
        let reduced = dag.reduce(&assignment, -8, -4, 4);
        assert_eq!(expanded.polynomial, reduced.polynomial);
        assert!(expanded.truncated_terms_dropped > 0);
    }

    #[test]
    fn special_signed_control_really_cancels_the_leading_coefficient() {
        let triangulations = enumerate_triangulations(4);
        let assignment = SampleAssignment::new(4, SampleFamily::SpecialAlternating);
        let expanded = exact_series_sum(&triangulations, &assignment, 2);
        assert_eq!(expanded.cancellation.cancellation_order, Some(1));
        assert_eq!(first_surviving_order(&expanded.polynomial, 4), Some(1));
        assert_eq!(expanded.cancellation.cancelled_groups.len(), 1);
    }

    #[test]
    fn finite_exact_check_is_inside_the_rigorous_tail_bound() {
        let triangulations = enumerate_triangulations(5);
        let assignment = SampleAssignment::new(5, SampleFamily::GenericA);
        let order = 4;
        let expanded = exact_series_sum(&triangulations, &assignment, order);
        let direct = direct_rational_sum(&triangulations, &assignment, 101);
        let truncated = expanded.polynomial.evaluate_exact(101);
        let error = (direct - truncated).abs();
        let bound = truncation_tail_bound(&triangulations, &assignment, 101, order);
        assert!(error <= bound);
    }

    #[test]
    fn cancellation_detector_reports_leading_order_and_locality() {
        let channel = Channel::new(0, 2);
        let raw = vec![
            RawTerm {
                term_id: 0,
                order: 0,
                exponent: -1,
                coefficient: rational_integer(1),
                channels: vec![channel],
            },
            RawTerm {
                term_id: 1,
                order: 0,
                exponent: -1,
                coefficient: rational_integer(-1),
                channels: vec![channel],
            },
            RawTerm {
                term_id: 2,
                order: 1,
                exponent: -2,
                coefficient: rational_integer(3),
                channels: vec![channel],
            },
        ];
        let (result, report) = sparse_sum(&raw);
        assert_eq!(result, Laurent::from_monomial(-2, rational_integer(3)));
        assert_eq!(report.cancellation_order, Some(1));
        assert_eq!(report.cancelled_groups[0].shared_channels, vec![channel]);
    }

    #[test]
    fn truncation_drops_out_of_window_terms_exactly() {
        let left = Laurent::from_monomial(-2, rational_integer(1));
        let right = Laurent::from_monomial(-3, rational_integer(1));
        let (product, dropped) = left.mul_truncated(&right, -4, 0);
        assert_eq!(product, Laurent::zero());
        assert_eq!(dropped, 1);
    }
}
