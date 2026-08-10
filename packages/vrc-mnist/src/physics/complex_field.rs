use burn::tensor::{Tensor, backend::Backend};

#[derive(Clone, Debug)]
pub struct ComplexField<B: Backend> {
    pub re: Tensor<B, 4>,
    pub im: Tensor<B, 4>,
}

impl<B: Backend> ComplexField<B> {
    pub fn new(re: Tensor<B, 4>, im: Tensor<B, 4>) -> Self {
        Self { re, im }
    }

    pub fn intensity(&self) -> Tensor<B, 4> {
        self.re.clone().powf_scalar(2.0) + self.im.clone().powf_scalar(2.0)
    }

    pub fn norm_proxy(&self) -> Tensor<B, 1> {
        self.intensity().mean().reshape([1])
    }

    pub fn difference(&self, previous: &Self) -> Tensor<B, 1> {
        let dr = self.re.clone() - previous.re.clone();
        let di = self.im.clone() - previous.im.clone();
        (dr.powf_scalar(2.0) + di.powf_scalar(2.0))
            .mean()
            .sqrt()
            .reshape([1])
    }

    /// Explicitly computes (a+ib)(c+id).
    pub fn multiply(&self, other: &Self) -> Self {
        let re = self.re.clone() * other.re.clone() - self.im.clone() * other.im.clone();
        let im = self.re.clone() * other.im.clone() + self.im.clone() * other.re.clone();
        Self { re, im }
    }
}
