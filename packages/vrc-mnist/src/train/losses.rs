use burn::{
    nn::loss::CrossEntropyLossConfig,
    tensor::{Int, Tensor, backend::Backend},
};

pub fn trajectory_loss<B: Backend>(
    logits: &[Tensor<B, 2>],
    targets: Tensor<B, 1, Int>,
    intermediate: f32,
) -> Tensor<B, 1> {
    assert!(!logits.is_empty());
    let loss = CrossEntropyLossConfig::new().init(&logits[0].device());
    let last = logits.len() - 1;
    let mut total = loss.forward(logits[last].clone(), targets.clone());
    for item in &logits[..last] {
        total = total
            + loss
                .forward(item.clone(), targets.clone())
                .mul_scalar(intermediate);
    }
    total
}
